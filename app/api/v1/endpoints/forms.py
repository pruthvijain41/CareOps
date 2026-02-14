"""
CareOps — Forms API Endpoints
Public form submission, form CRUD, and submission tracking.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/forms", tags=["forms"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class PublicFormSubmission(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=25)
    message: str = Field(default="", max_length=5000)


class FormCreateSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    schema_fields: dict[str, Any] = Field(default_factory=dict, alias="schema")

    model_config = {"populate_by_name": True}


class FormUpdateSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    schema_fields: dict[str, Any] | None = Field(default=None, alias="schema")
    is_active: bool | None = None

    model_config = {"populate_by_name": True}


class DynamicFormSubmission(BaseModel):
    """Dynamic form submission — accepts any JSON fields."""
    data: dict[str, Any]
    name: str | None = None
    email: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_workspace_id(db: Any, user_id: str) -> str:
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(403, "Profile not found")
    return profile.data["workspace_id"]


# ── STATIC ROUTES FIRST (before /{form_id}) ──────────────────────────────────


# ── Public Contact Form Submission ───────────────────────────────────────────


@router.post(
    "/public/{workspace_slug}",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a public contact form",
    description="No auth required. Creates a contact and conversation in the workspace.",
)
async def submit_public_form(
    workspace_slug: str,
    data: PublicFormSubmission,
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """
    Public contact form submission:
    1. Look up workspace by slug
    2. Find or create contact by email
    3. Create a conversation thread
    4. Insert the form submission message
    """
    # Look up workspace
    ws_result = (
        db.table("workspaces")
        .select("id, name")
        .eq("slug", workspace_slug)
        .single()
        .execute()
    )

    if not ws_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{workspace_slug}' not found",
        )

    workspace_id = ws_result.data["id"]

    # Normalize phone if provided
    phone_clean = data.phone
    if data.phone:
        from app.services.whatsapp_service import WhatsAppService
        phone_clean = WhatsAppService.normalize_phone(data.phone)

    # Find or create contact
    existing_contact = None
    if phone_clean:
         existing_contact = (
            db.table("contacts")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("phone", phone_clean)
            .limit(1)
            .execute()
        )
    
    if not existing_contact or not existing_contact.data:
        existing_contact = (
            db.table("contacts")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("email", data.email)
            .limit(1)
            .execute()
        )

    if existing_contact.data:
        contact_id = existing_contact.data[0]["id"]
        # Update phone if it was missing
        if phone_clean:
            db.table("contacts").update({"phone": phone_clean}).eq("id", contact_id).execute()
    else:
        new_contact = (
            db.table("contacts")
            .insert({
                "workspace_id": workspace_id,
                "full_name": data.name,
                "email": data.email,
                "phone": phone_clean,
                "tags": ["lead", "contact-form"],
                "metadata": {},
            })
            .execute()
        )
        if not new_contact.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create contact",
            )
        contact_id = new_contact.data[0]["id"]

    # Create conversation thread
    conversation = (
        db.table("conversations")
        .insert({
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "subject": f"Contact form: {data.name}",
            "channel": "internal",
            "last_message_at": "now()",
        })
        .execute()
    )

    if not conversation.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation",
        )

    conversation_id = conversation.data[0]["id"]

    # Insert message
    message_body = data.message or f"New contact form submission from {data.name}"
    db.table("messages").insert({
        "conversation_id": conversation_id,
        "workspace_id": workspace_id,
        "sender_type": "contact",
        "sender_id": contact_id,
        "source": "internal",
        "body": message_body,
    }).execute()

    # Insert into form_submissions if there's a default form
    default_form = (
        db.table("forms")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )

    if default_form.data:
        db.table("form_submissions").insert({
            "form_id": default_form.data[0]["id"],
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "data": {
                "name": data.name,
                "email": data.email,
                "phone": data.phone,
                "message": data.message,
            },
        }).execute()

    logger.info(
        "📋 Public form submitted: %s (%s) → workspace %s",
        data.name,
        data.email,
        workspace_slug,
    )

    # ── Send thank-you WhatsApp to the submitter ──────────────────────
    if data.phone:
        try:
            # Clean phone and send via centralized helper
            from app.services.whatsapp_service import WhatsAppService
            from app.core.config import get_settings
            
            phone_clean = WhatsAppService.normalize_phone(str(data.phone))
            if phone_clean:
                wa = WhatsAppService(get_settings())
                wa_body = f"Hi {data.name}, thank you for reaching out to us! We've received your message and will get back to you shortly."
                import asyncio
                asyncio.create_task(wa.send_message(chat_id=phone_clean, text=wa_body))
                logger.info("📱 Thank-you WhatsApp queued for %s", phone_clean)
        except Exception as exc:
            logger.warning("📱 Failed to send thank-you WhatsApp (non-blocking): %s", exc)

    # Fire automation trigger for new lead
    try:
        from app.services.automation_engine import AutomationEngine
        from app.core.config import get_settings
        engine = AutomationEngine(get_settings(), db)
        import asyncio
        asyncio.create_task(
            engine.fire_trigger(
                workspace_id,
                "new_lead",
                {
                    "contact_name": data.name,
                    "contact_email": data.email,
                    "contact_phone": data.phone or "",
                    "conversation_id": conversation_id,
                    "message": data.message,
                },
            )
        )
    except Exception as exc:
        logger.warning("Automation trigger failed (non-blocking): %s", exc)

    return {"status": "received", "message": "Your message has been received. We'll be in touch shortly."}


# ── List Forms (static path "") ──────────────────────────────────────────────


@router.get(
    "",
    summary="List all forms in workspace",
    description="Fetch all form definitions for the workspace.",
)
async def list_forms(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List all forms for the user's workspace."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    result = (
        db.table("forms")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )

    return result.data or []


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new form",
)
async def create_form(
    data: FormCreateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Create a new form with title, description, and schema."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    result = (
        db.table("forms")
        .insert({
            "workspace_id": workspace_id,
            "title": data.title,
            "description": data.description or "",
            "schema": data.schema_fields,
            "is_active": True,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(500, "Failed to create form")

    logger.info("📋 Form created: %s for workspace %s", data.title, workspace_id)
    return result.data[0]


# ── List Form Submissions (static path "/submissions") ───────────────────────


@router.get(
    "/submissions",
    summary="List form submissions",
    description="Fetch all form submissions for the workspace.",
)
async def list_form_submissions(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List all form submissions for the user's workspace."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    result = (
        db.table("form_submissions")
        .select("*, forms(title)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    return result.data or []


@router.post(
    "/submissions/mark-read",
    summary="Mark all form submissions as read",
    description="Mark all unread form submissions in the workspace as read.",
)
async def mark_submissions_read(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """Mark all form submissions as read for the user's workspace."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    db.table("form_submissions").update(
        {"is_read": True}
    ).eq("workspace_id", workspace_id).eq("is_read", False).execute()

    return {"status": "ok"}


# ── Public Form Access (static path prefix "/public") ────────────────────────


@router.get(
    "/public/form/{form_id}",
    summary="Get public form schema",
    description="No auth required. Returns form schema for public filling.",
)
async def get_public_form(
    form_id: UUID,
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Get a form's schema for public filling — no auth required."""
    result = (
        db.table("forms")
        .select("id, title, description, schema, workspace_id")
        .eq("id", str(form_id))
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Form not found or inactive")

    # Get workspace name for branding
    ws = (
        db.table("workspaces")
        .select("name")
        .eq("id", result.data["workspace_id"])
        .single()
        .execute()
    )
    workspace_name = ws.data["name"] if ws.data else "CareOps"

    return {
        "id": result.data["id"],
        "title": result.data["title"],
        "description": result.data["description"],
        "schema": result.data["schema"],
        "workspace_name": workspace_name,
    }


@router.post(
    "/public/form/{form_id}/submit",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a public form",
)
async def submit_public_dynamic_form(
    form_id: UUID,
    data: DynamicFormSubmission,
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """Submit a dynamic form — accepts any JSON data matching the form's schema."""
    # Look up form
    form = (
        db.table("forms")
        .select("id, workspace_id, title, schema")
        .eq("id", str(form_id))
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not form.data:
        raise HTTPException(404, "Form not found or inactive")

    workspace_id = form.data["workspace_id"]

    # Validate required fields from schema
    # Frontend sends data keyed by field LABEL, so validate by label
    schema = form.data.get("schema", {})
    fields = schema.get("fields", [])
    for field in fields:
        label = field.get("label", field["id"])
        if field.get("required") and not data.data.get(label):
            raise HTTPException(400, f"Field '{label}' is required")

    # Find or create contact if email provided
    contact_id = None
    contact_email = data.email or data.data.get("Email", "") or data.data.get("email", "")
    contact_name = data.name or data.data.get("Name", "") or data.data.get("Full Name", "") or data.data.get("name", "Anonymous")
    contact_phone = data.data.get("Phone", "") or data.data.get("phone", "") or data.data.get("Mobile", "") or data.data.get("number", "")

    if contact_email or contact_phone:
        # Normalize phone
        from app.services.whatsapp_service import WhatsAppService
        phone_clean = WhatsAppService.normalize_phone(contact_phone) if contact_phone else contact_phone

        existing = None
        if phone_clean:
             existing = (
                db.table("contacts")
                .select("id")
                .eq("workspace_id", workspace_id)
                .eq("phone", phone_clean)
                .limit(1)
                .execute()
            )
        
        if (not existing or not existing.data) and contact_email:
            existing = (
                db.table("contacts")
                .select("id")
                .eq("workspace_id", workspace_id)
                .eq("email", contact_email)
                .limit(1)
                .execute()
            )

        if existing and existing.data:
            contact_id = existing.data[0]["id"]
            # Enrichment: update phone if missing or provided
            if phone_clean:
                db.table("contacts").update({"phone": phone_clean}).eq("id", contact_id).execute()
        else:
            new_contact = (
                db.table("contacts")
                .insert({
                    "workspace_id": workspace_id,
                    "full_name": contact_name,
                    "email": contact_email,
                    "phone": phone_clean,
                    "tags": ["form-submission"],
                    "metadata": {},
                })
                .execute()
            )
            if new_contact.data:
                contact_id = new_contact.data[0]["id"]

    # Insert submission
    db.table("form_submissions").insert({
        "form_id": str(form_id),
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "data": data.data,
    }).execute()

    # Create conversation thread for the submission
    if contact_id:
        conv = (
            db.table("conversations")
            .insert({
                "workspace_id": workspace_id,
                "contact_id": contact_id,
                "subject": f"Form: {form.data['title']} — {contact_name}",
                "channel": "internal",
                "last_message_at": "now()",
            })
            .execute()
        )

        if conv.data:
            # Build a formatted message from the submission data (plain text, no markdown)
            lines = [f"📋 {form.data['title']} submission\n"]
            for key, value in data.data.items():
                lines.append(f"{key}: {value}")

            db.table("messages").insert({
                "conversation_id": conv.data[0]["id"],
                "workspace_id": workspace_id,
                "sender_type": "contact",
                "sender_id": contact_id,
                "source": "internal",
                "body": "\n".join(lines),
            }).execute()

    logger.info("📋 Form %s submitted by %s", form.data["title"], contact_name)

    # ── Send thank-you confirmation email to the submitter ────────────
    if contact_email:
        try:
            from app.services.gmail_service import GmailService
            gmail = GmailService(settings, db)

            # Get workspace name for branding
            ws = (
                db.table("workspaces")
                .select("name")
                .eq("id", workspace_id)
                .single()
                .execute()
            )
            ws_name = ws.data["name"] if ws.data else "Our Team"

            html_body = f"""
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="border: 1px solid #e5e5e5; padding: 32px;">
                    <h2 style="font-family: monospace; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0; color: #333;">
                        Thank You, {contact_name}!
                    </h2>
                    <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0 0 16px 0;">
                        We've received your response to <strong>{form.data['title']}</strong>. Our team will review your submission and get back to you shortly.
                    </p>
                    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 16px; margin: 20px 0;">
                        <p style="font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; margin: 0 0 12px 0;">
                            Your Submission Summary
                        </p>
                        {''.join(
                            f'<p style="font-size: 13px; color: #555; margin: 4px 0;"><strong>{k}:</strong> {v}</p>'
                            for k, v in data.data.items()
                            if v and str(v).strip()
                        )}
                    </div>
                    <p style="font-size: 13px; color: #888; margin: 16px 0 0 0;">
                        If you have any questions, simply reply to this email.
                    </p>
                </div>
                <p style="font-family: monospace; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-top: 12px;">
                    {ws_name} — Powered by CareOps
                </p>
            </div>
            """

            import asyncio
            asyncio.create_task(
                gmail.send_email(
                    workspace_id=workspace_id,
                    to=contact_email,
                    subject=f"Thank you for your submission — {form.data['title']}",
                    body_html=html_body,
                )
            )
            logger.info("📧 Thank-you email queued for %s", contact_email)
        except Exception as exc:
            logger.warning("📧 Failed to send thank-you email (non-blocking): %s", exc)

    # ── Send thank-you WhatsApp to the submitter ──────────────────────
    if contact_phone:
        try:
            # Clean phone and send via centralized helper
            phone_clean = WhatsAppService.normalize_phone(str(contact_phone))
            if phone_clean:
                wa_body = f"Hi {contact_name}, thank you for your submission to '{form.data['title']}'. We've received your details and will get back to you shortly!"
                import asyncio
                asyncio.create_task(wa.send_message(chat_id=phone_clean, text=wa_body))
                logger.info("📱 Thank-you WhatsApp queued for %s", phone_clean)
        except Exception as exc:
            logger.warning("📱 Failed to send thank-you WhatsApp (non-blocking): %s", exc)

    # Fire automation
    try:
        from app.services.automation_engine import AutomationEngine
        from app.core.config import get_settings
        engine = AutomationEngine(get_settings(), db)
        import asyncio
        asyncio.create_task(
            engine.fire_trigger(
                workspace_id,
                "form_submitted",
                {
                    "contact_name": contact_name,
                    "contact_email": contact_email,
                    "contact_phone": contact_phone,
                    "form_title": form.data["title"],
                    "message": f"Submitted form: {form.data['title']}",
                },
            )
        )
    except Exception as exc:
        logger.warning("Automation trigger failed: %s", exc)

    return {"status": "received", "message": "Form submitted successfully."}


# ── PARAMETRIC ROUTES (/{form_id}) — MUST come AFTER static routes ───────────


@router.get(
    "/{form_id}",
    summary="Get a single form",
)
async def get_form(
    form_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Get a single form by ID (must belong to user's workspace)."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    result = (
        db.table("forms")
        .select("*")
        .eq("id", str(form_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Form not found")
    return result.data


@router.patch(
    "/{form_id}",
    summary="Update a form",
)
async def update_form(
    form_id: UUID,
    data: FormUpdateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Update a form's title, description, schema, or active status."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    update_data = {}
    if data.title is not None:
        update_data["title"] = data.title
    if data.description is not None:
        update_data["description"] = data.description
    if data.schema_fields is not None:
        update_data["schema"] = data.schema_fields
    if data.is_active is not None:
        update_data["is_active"] = data.is_active

    if not update_data:
        raise HTTPException(400, "No fields to update")

    result = (
        db.table("forms")
        .update(update_data)
        .eq("id", str(form_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Form not found")
    return result.data[0]


@router.delete(
    "/{form_id}",
    summary="Delete a form",
)
async def delete_form(
    form_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """Delete a form and all its submissions."""
    workspace_id = _get_workspace_id(db, current_user["id"])

    db.table("forms").delete().eq("id", str(form_id)).eq("workspace_id", workspace_id).execute()

    logger.info("📋 Form deleted: %s", form_id)
    return {"status": "deleted", "form_id": str(form_id)}
