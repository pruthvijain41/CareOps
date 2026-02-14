"""
CareOps — Staff Management API Endpoints
Staff invitation (with Supabase admin user creation + Gmail credentials),
listing, permission management, and removal.
"""

import logging
import secrets
import string
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.core.dependencies import CurrentUser, SupabaseClient, AppSettings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/staff", tags=["staff"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class PermissionsSchema(BaseModel):
    inbox: bool = True
    bookings: bool = True
    forms: bool = True
    inventory: bool = False
    reports: bool = False


class StaffInviteSchema(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    permissions: PermissionsSchema = PermissionsSchema()


class StaffUpdateSchema(BaseModel):
    role: str | None = None
    full_name: str | None = None


class StaffPermissionsUpdateSchema(BaseModel):
    permissions: PermissionsSchema


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_workspace_id(current_user: dict, db: Any) -> str:
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id, role").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    return profile.data["workspace_id"]


def _require_owner(current_user: dict, db: Any) -> str:
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id, role").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    if profile.data["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only workspace owners can manage staff")
    return profile.data["workspace_id"]


def _generate_password(length: int = 12) -> str:
    """Generate a strong random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    # Guarantee at least one of each type
    password = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
    ]
    password += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)


# ── List Staff ───────────────────────────────────────────────────────────────


@router.get(
    "",
    summary="List staff members",
    description="Fetch all staff/owner profiles in the workspace.",
)
async def list_staff(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    workspace_id = _get_workspace_id(current_user, db)
    result = (
        db.table("profiles")
        .select("id, workspace_id, role, full_name, avatar_url, phone, permissions, created_at, updated_at")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
    )

    # Also fetch emails from auth — we need to get user emails
    profiles = result.data or []
    for p in profiles:
        # Try to get email from auth.users via admin
        try:
            user_resp = db.auth.admin.get_user_by_id(p["id"])
            if user_resp and user_resp.user:
                p["email"] = user_resp.user.email
        except Exception:
            p["email"] = None

    return profiles


# ── Invite Staff ─────────────────────────────────────────────────────────────


@router.post(
    "/invite",
    status_code=status.HTTP_201_CREATED,
    summary="Invite a staff member",
    description="Create a new staff user account with auto-generated password. Owner only.",
)
async def invite_staff(
    data: StaffInviteSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _require_owner(current_user, db)

    # Check if email already exists in this workspace's profiles
    existing = (
        db.table("profiles")
        .select("id")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    existing_ids = [e["id"] for e in (existing.data or [])]

    # Check if this specific email is already a user
    try:
        # Search all users — unfortunately supabase-py doesn't have list_users with filter
        # So we'll just try to create and catch the duplicate error
        pass
    except Exception:
        pass

    # 1. Generate strong password
    password = _generate_password(12)

    # 2. Create Supabase auth user via admin API
    try:
        user_response = db.auth.admin.create_user({
            "email": data.email,
            "password": password,
            "email_confirm": True,  # Skip email verification
            "user_metadata": {
                "full_name": data.full_name,
                "workspace_id": workspace_id,
                "role": "staff",
            },
        })
    except Exception as exc:
        error_msg = str(exc)
        if "already" in error_msg.lower() or "duplicate" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail=f"A user with email {data.email} already exists. They may need to be added to this workspace instead.",
            )
        logger.error("Failed to create auth user: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to create user account: {error_msg}")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=500, detail="Failed to create user account")

    new_user_id = str(user_response.user.id)

    # 3. Create profile row
    permissions_dict = data.permissions.model_dump()
    try:
        db.table("profiles").insert({
            "id": new_user_id,
            "workspace_id": workspace_id,
            "role": "staff",
            "full_name": data.full_name,
            "permissions": permissions_dict,
        }).execute()
    except Exception as exc:
        logger.error("Failed to create profile: %s", exc)
        # Try to clean up the auth user
        try:
            db.auth.admin.delete_user(new_user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to create staff profile: {exc}")

    # 4. Record invitation
    try:
        db.table("staff_invitations").insert({
            "workspace_id": workspace_id,
            "email": data.email,
            "full_name": data.full_name,
            "role": "staff",
            "permissions": permissions_dict,
            "status": "accepted",
            "invited_by": current_user.get("id"),
        }).execute()
    except Exception:
        # Table may not exist yet — that's OK, invitation tracking is optional
        logger.warning("staff_invitations table may not exist — skipping record")

    # 5. Send credentials email via Gmail
    try:
        # Get workspace name for the email
        ws = db.table("workspaces").select("name").eq("id", workspace_id).single().execute()
        workspace_name = ws.data["name"] if ws.data else "CareOps Workspace"

        owner_profile = (
            db.table("profiles")
            .select("full_name")
            .eq("id", current_user.get("id"))
            .single()
            .execute()
        )
        owner_name = owner_profile.data.get("full_name", "The Owner") if owner_profile.data else "The Owner"

        from app.services.gmail_service import GmailService
        gmail = GmailService(settings, db)

        email_body = f"""Hi {data.full_name},

You've been invited to join {workspace_name} on CareOps as a staff member.

Here are your login credentials:

Email: {data.email}
Password: {password}

Login here: {settings.FRONTEND_URL}/login

Your permissions:
- Inbox: {"✅ Enabled" if permissions_dict.get("inbox") else "❌ Disabled"}
- Bookings: {"✅ Enabled" if permissions_dict.get("bookings") else "❌ Disabled"}
- Forms: {"✅ Enabled" if permissions_dict.get("forms") else "❌ Disabled"}
- Inventory: {"✅ Enabled" if permissions_dict.get("inventory") else "❌ Disabled"}
- Reports: {"✅ Enabled" if permissions_dict.get("reports") else "❌ Disabled"}

Please change your password after your first login.

Best regards,
{owner_name}
{workspace_name}"""

        await gmail.send_email(
            workspace_id=workspace_id,
            to=data.email,
            subject=f"You've been invited to join {workspace_name} on CareOps",
            body_html=email_body.replace("\n", "<br>"),
        )
        logger.info("📧 Staff credentials email sent to %s", data.email)
    except Exception as exc:
        # Email sending failed — but user was created successfully
        logger.warning("Failed to send credentials email to %s: %s", data.email, exc)
        return {
            "status": "created",
            "email": data.email,
            "user_id": new_user_id,
            "password": password,  # Return password since email failed
            "message": f"Staff account created but email delivery failed. Password: {password}",
            "email_sent": False,
        }

    logger.info("👤 Staff invited: %s → workspace %s", data.email, workspace_id)
    return {
        "status": "created",
        "email": data.email,
        "user_id": new_user_id,
        "message": f"Staff account created and credentials sent to {data.email}",
        "email_sent": True,
    }


# ── List Invitations ─────────────────────────────────────────────────────────


@router.get(
    "/invitations",
    summary="List staff invitations",
    description="Fetch all staff invitations for the workspace. Owner only.",
)
async def list_invitations(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    workspace_id = _require_owner(current_user, db)
    try:
        result = (
            db.table("staff_invitations")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


# ── Update Staff Permissions ─────────────────────────────────────────────────


@router.patch(
    "/{staff_id}/permissions",
    summary="Update staff permissions",
    description="Owner only. Update which pages a staff member can access.",
)
async def update_permissions(
    staff_id: UUID,
    data: StaffPermissionsUpdateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _require_owner(current_user, db)

    # Can't edit owner permissions
    target = (
        db.table("profiles")
        .select("role")
        .eq("id", str(staff_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not target.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if target.data["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot modify owner permissions")

    result = (
        db.table("profiles")
        .update({"permissions": data.permissions.model_dump()})
        .eq("id", str(staff_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return result.data[0]


# ── Update Staff Info ────────────────────────────────────────────────────────


@router.patch(
    "/{staff_id}",
    summary="Update a staff member's role or info",
    description="Owner only.",
)
async def update_staff(
    staff_id: UUID,
    data: StaffUpdateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _require_owner(current_user, db)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        db.table("profiles")
        .update(update_data)
        .eq("id", str(staff_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return result.data[0]


# ── Remove Staff ─────────────────────────────────────────────────────────────


@router.delete(
    "/{staff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a staff member",
    description="Owner only. Cannot remove yourself. Deletes both profile and auth user.",
)
async def remove_staff(
    staff_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> None:
    workspace_id = _require_owner(current_user, db)

    if str(staff_id) == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot remove yourself from the workspace")

    # Delete profile
    db.table("profiles").delete().eq("id", str(staff_id)).eq("workspace_id", workspace_id).execute()

    # Delete auth user
    try:
        db.auth.admin.delete_user(str(staff_id))
    except Exception as exc:
        logger.warning("Failed to delete auth user %s: %s", staff_id, exc)
