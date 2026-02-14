"""
CareOps — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup & shutdown hooks."""
    settings = get_settings()
    print(f"🚀 CareOps starting — env={settings.ENVIRONMENT}")

    # Start the automation scheduler (booking reminders, form reminders)
    from app.services.scheduler import AutomationScheduler
    scheduler = AutomationScheduler(settings, interval_seconds=60)
    scheduler.start()

    # Start WhatsApp bridge if not already running
    # In production (Render), start.sh handles this; in dev, BridgeManager does
    if settings.ENVIRONMENT != "production":
        from app.services.bridge_manager import BridgeManager
        from pathlib import Path
        workspace_root = Path(__file__).resolve().parent.parent
        BridgeManager.start_bridge(workspace_root)

    yield

    # Shutdown
    await scheduler.stop()
    print("👋 CareOps shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="CareOps API",
        description="Unified operations platform for service-based businesses",
        version="0.1.0",
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan,
    )

    # -- Logging Middleware --
    from fastapi import Request
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info(f"Incoming request: {request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response

    # -- CORS --
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -- Routers --
    app.include_router(api_v1_router, prefix="/api/v1")

    # -- Health check --
    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, Any]:
        """
        System health check.
        Verifies core service connectivity:
        - Supabase DB reachability
        - Configured API integrations
        """
        health: dict[str, Any] = {
            "status": "healthy",
            "service": "careops",
            "environment": settings.ENVIRONMENT,
        }

        # Check Supabase connectivity
        try:
            from supabase import create_client

            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
            # Simple query to verify DB is reachable
            result = client.table("workspaces").select("id").limit(1).execute()
            health["database"] = "connected"
            health["workspaces_count"] = len(result.data) if result.data else 0
        except Exception as exc:
            health["status"] = "degraded"
            health["database"] = f"error: {exc}"

        # Report integration config status
        health["integrations"] = {
            "groq": "configured" if settings.GROQ_API_KEY else "not configured",
            "gmail": "configured" if settings.GMAIL_CLIENT_ID else "not configured",
            "telegram": "configured" if settings.TELEGRAM_BOT_TOKEN else "not configured",
            "google_calendar": "configured" if settings.GCAL_CLIENT_ID else "not configured",
            "google_tts": "configured" if settings.GOOGLE_CLOUD_PROJECT_ID else "not configured",
        }

        return health

    return app


app = create_app()
