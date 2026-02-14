"""
CareOps — Google OAuth Endpoints
Connect/disconnect Gmail and Google Calendar via OAuth 2.0.
"""

import logging
from typing import Any

import requests as http_requests
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.core.config import Settings
from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient
from app.services.whatsapp_service import WhatsAppService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["OAuth"])

# ── Scopes ───────────────────────────────────────────────────────────────────

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

GCAL_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]


def _get_workspace_id(db: Any, user_id: str) -> str:
    """Look up the workspace_id for a user from profiles table."""
    result = (
        db.table("profiles")
        .select("workspace_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "User profile not found")
    return result.data["workspace_id"]


def _build_flow(settings: Any, provider: str) -> Flow:
    """Build a Google OAuth Flow for the given provider."""
    if provider == "gmail":
        client_id = settings.GMAIL_CLIENT_ID
        client_secret = settings.GMAIL_CLIENT_SECRET
        redirect_uri = settings.GMAIL_REDIRECT_URI
        scopes = GMAIL_SCOPES
    elif provider == "gcal":
        client_id = settings.GCAL_CLIENT_ID
        client_secret = settings.GCAL_CLIENT_SECRET
        redirect_uri = settings.GCAL_REDIRECT_URI
        scopes = GCAL_SCOPES
    else:
        raise ValueError(f"Unknown provider: {provider}")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} OAuth is not configured (missing client_id/secret)",
        )

    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(client_config, scopes=scopes)
    flow.redirect_uri = redirect_uri
    return flow


def _exchange_code(settings: Any, provider: str, code: str) -> dict:
    """Exchange authorization code for tokens directly via HTTP POST.

    This avoids the google-auth library's strict scope checking which
    fails when Google merges previously-granted scopes (e.g. gmail.send
    gets merged into calendar callback when both use the same account).
    """
    if provider == "gmail":
        client_id = settings.GMAIL_CLIENT_ID
        client_secret = settings.GMAIL_CLIENT_SECRET
        redirect_uri = settings.GMAIL_REDIRECT_URI
    else:
        client_id = settings.GCAL_CLIENT_ID
        client_secret = settings.GCAL_CLIENT_SECRET
        redirect_uri = settings.GCAL_REDIRECT_URI

    resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token exchange failed: {resp.text}")
    return resp.json()


# ── Gmail Connect ────────────────────────────────────────────────────────────


@router.get(
    "/gmail/connect",
    summary="Get Gmail OAuth consent URL",
    description="Returns a URL to redirect the user to for Gmail authorization.",
)
async def gmail_connect(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    workspace_id = _get_workspace_id(db, current_user["id"])
    flow = _build_flow(settings, "gmail")
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=workspace_id,
    )
    return {"authorization_url": auth_url, "state": state}


@router.get(
    "/gmail/callback",
    summary="Gmail OAuth callback",
    description="Handles the callback from Google after Gmail authorization.",
)
async def gmail_callback(
    code: str = Query(...),
    state: str = Query(""),
    settings: AppSettings = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> RedirectResponse:
    workspace_id = state
    if not workspace_id:
        raise HTTPException(400, "Missing workspace_id in state")

    try:
        # Exchange code for tokens manually (avoids scope-mismatch errors)
        token_data = _exchange_code(settings, "gmail", code)
        creds = Credentials(
            token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GMAIL_CLIENT_ID,
            client_secret=settings.GMAIL_CLIENT_SECRET,
        )

        # Get connected email
        from googleapiclient.discovery import build
        oauth2 = build("oauth2", "v2", credentials=creds)
        user_info = oauth2.userinfo().get().execute()
        connected_email = user_info.get("email", "")

        # Store credentials
        creds_data = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
        }

        # Upsert into integrations
        db.table("integrations").upsert(
            {
                "workspace_id": workspace_id,
                "provider": "gmail",
                "credentials": creds_data,
                "connected_email": connected_email,
                "is_active": True,
            },
            on_conflict="workspace_id,provider",
        ).execute()

        logger.info("✅ Gmail connected for workspace %s (%s)", workspace_id, connected_email)

    except Exception as exc:
        logger.error("Gmail OAuth callback failed: %s", exc)
        # Return a page that shows the error and auto-closes after a few seconds
        error_html = f"""
        <html><head><title>Gmail Connection Failed</title></head>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#fafafa;">
            <div style="text-align:center;max-width:400px;padding:40px;">
                <div style="font-size:48px;margin-bottom:16px;">❌</div>
                <h2 style="color:#0f172a;margin-bottom:8px;">Connection Failed</h2>
                <p style="color:#64748b;font-size:14px;margin-bottom:24px;">
                    Something went wrong connecting Gmail. Please close this tab and try again.
                </p>
                <p style="color:#94a3b8;font-size:12px;">{str(exc)[:100]}</p>
            </div>
        </body></html>
        """
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=error_html)

    # Return a self-closing page — the onboarding tab polls for connection status
    success_html = """
    <html><head><title>Gmail Connected</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#fafafa;">
        <div style="text-align:center;max-width:400px;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;">✅</div>
            <h2 style="color:#0f172a;margin-bottom:8px;">Gmail Connected!</h2>
            <p style="color:#64748b;font-size:14px;margin-bottom:24px;">
                You can close this tab and go back to the onboarding page.
            </p>
            <p style="color:#94a3b8;font-size:12px;">This tab will close automatically...</p>
        </div>
        <script>setTimeout(function(){ window.close(); }, 2000);</script>
    </body></html>
    """
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=success_html)


# ── Google Calendar Connect ──────────────────────────────────────────────────


@router.get(
    "/gcal/connect",
    summary="Get Google Calendar OAuth consent URL",
)
async def gcal_connect(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    workspace_id = _get_workspace_id(db, current_user["id"])
    flow = _build_flow(settings, "gcal")
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=workspace_id,
    )
    return {"authorization_url": auth_url, "state": state}


@router.get(
    "/gcal/callback",
    summary="Google Calendar OAuth callback",
)
async def gcal_callback(
    code: str = Query(...),
    state: str = Query(""),
    settings: AppSettings = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> RedirectResponse:
    workspace_id = state
    if not workspace_id:
        raise HTTPException(400, "Missing workspace_id in state")

    try:
        # Exchange code for tokens manually (avoids scope-mismatch errors)
        token_data = _exchange_code(settings, "gcal", code)
        creds = Credentials(
            token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GCAL_CLIENT_ID,
            client_secret=settings.GCAL_CLIENT_SECRET,
        )

        from googleapiclient.discovery import build
        oauth2 = build("oauth2", "v2", credentials=creds)
        user_info = oauth2.userinfo().get().execute()
        connected_email = user_info.get("email", "")

        creds_data = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
        }

        db.table("integrations").upsert(
            {
                "workspace_id": workspace_id,
                "provider": "gcal",
                "credentials": creds_data,
                "connected_email": connected_email,
                "is_active": True,
            },
            on_conflict="workspace_id,provider",
        ).execute()

        logger.info("✅ Google Calendar connected for workspace %s (%s)", workspace_id, connected_email)

    except Exception as exc:
        logger.error("GCal OAuth callback failed: %s", exc)
        return RedirectResponse(
            url=f"http://localhost:3000/settings?error=gcal_failed&detail={str(exc)[:100]}",
        )

    try:
        ws = db.table("workspaces").select("slug").eq("id", workspace_id).single().execute()
        slug = ws.data["slug"] if ws.data else ""
    except Exception:
        slug = ""

    return RedirectResponse(url=f"http://localhost:3000/{slug}/settings?connected=gcal")


# ── Integration Status ───────────────────────────────────────────────────────


@router.get(
    "/integrations/status",
    summary="Get integration connection status",
)
async def get_integration_status(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _get_workspace_id(db, current_user["id"])

    result = (
        db.table("integrations")
        .select("provider, connected_email, is_active, created_at")
        .eq("workspace_id", workspace_id)
        .execute()
    )

    status_map: dict[str, Any] = {}
    for row in result.data or []:
        status_map[row["provider"]] = {
            "connected": row["is_active"],
            "email": row.get("connected_email"),
            "connected_at": row.get("created_at"),
        }

    # Add WhatsApp status
    wa = WhatsAppService(Settings())
    wa_status = await wa.get_status()
    
    return {
        "gmail": status_map.get("gmail", {"connected": False}),
        "gcal": status_map.get("gcal", {"connected": False}),
        "whatsapp": {
            "connected": wa_status.get("state") == "connected",
            "state": wa_status.get("state"),
        }
    }


# ── Disconnect ───────────────────────────────────────────────────────────────


@router.delete(
    "/integrations/{provider}",
    summary="Disconnect an integration",
)
async def disconnect_integration(
    provider: str,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    if provider not in ("gmail", "gcal", "whatsapp"):
        raise HTTPException(400, "Invalid provider. Must be 'gmail', 'gcal', or 'whatsapp'.")

    workspace_id = _get_workspace_id(db, current_user["id"])

    if provider == "whatsapp":
        wa = WhatsAppService(Settings())
        await wa.logout()
    else:
        db.table("integrations").delete().eq(
            "workspace_id", workspace_id
        ).eq("provider", provider).execute()

    logger.info("🔌 Disconnected %s for workspace %s", provider, workspace_id)
    return {"status": "disconnected", "provider": provider}
