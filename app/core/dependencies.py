"""
CareOps — Shared Dependencies
FastAPI dependency injectors for Supabase client, auth, etc.
"""

from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from app.core.config import Settings, get_settings


# ── Supabase Client ──────────────────────────────────────────────────────────


def get_supabase_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Client:
    """Create a Supabase client using the service role key (server-side)."""
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


# ── Current User Extraction ─────────────────────────────────────────────────


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Validate the JWT from the Authorization header and return user info.
    Uses Supabase's auth.getUser() to validate the token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.removeprefix("Bearer ")

    try:
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        user_response = client.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        return {
            "id": str(user_response.user.id),
            "email": user_response.user.email,
            "role": user_response.user.role,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {exc}",
        ) from exc


# ── Type aliases for cleaner endpoint signatures ─────────────────────────────

CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
SupabaseClient = Annotated[Client, Depends(get_supabase_client)]
AppSettings = Annotated[Settings, Depends(get_settings)]
