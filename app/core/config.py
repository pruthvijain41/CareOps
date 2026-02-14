"""
CareOps — Application Configuration
Loads all environment variables via pydantic-settings.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # ── Application ──────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    APP_NAME: str = "CareOps"
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Supabase ─────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # ── Services ─────────────────────────────────────────────────────────
    WHATSAPP_BRIDGE_URL: str = "http://localhost:3001"

    # ── Groq (LLM + Whisper STT) ─────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_LLM_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3"

    # ── Google Cloud TTS ─────────────────────────────────────────────────
    GOOGLE_CLOUD_PROJECT_ID: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    GOOGLE_APPLICATION_CREDENTIALS_JSON: str = ""  # Full JSON content for production

    # ── Gmail API ────────────────────────────────────────────────────────
    GMAIL_CLIENT_ID: str = ""
    GMAIL_CLIENT_SECRET: str = ""
    GMAIL_REDIRECT_URI: str = ""
    GMAIL_WEBHOOK_SECRET: str = ""

    # ── Telegram Bot ─────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # ── Google Calendar ──────────────────────────────────────────────────
    GCAL_CLIENT_ID: str = ""
    GCAL_CLIENT_SECRET: str = ""
    GCAL_REDIRECT_URI: str = ""

    # ── Retry / Resilience ───────────────────────────────────────────────
    EXTERNAL_API_MAX_RETRIES: int = 3
    EXTERNAL_API_RETRY_DELAY: float = 1.0


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton for app settings."""
    return Settings()
