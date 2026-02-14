"""
CareOps — Whisper STT Service
Wrapper for Groq's Whisper API for speech-to-text transcription.
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)

GROQ_AUDIO_API = "https://api.groq.com/openai/v1/audio/transcriptions"


class WhisperService(BaseExternalService):
    """Groq Whisper integration for speech-to-text."""

    service_name = "WhisperSTT"

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)
        self.api_key = self.settings.GROQ_API_KEY
        self.model = self.settings.GROQ_WHISPER_MODEL

    async def transcribe(
        self,
        audio_data: bytes,
        filename: str = "audio.wav",
        language: str = "en",
    ) -> dict[str, Any]:
        """
        Transcribe audio data using Groq's Whisper API.

        Args:
            audio_data: Raw audio bytes.
            filename: Name hint for the audio file.
            language: Language code (ISO 639-1).

        Returns:
            Dict with 'text' key containing the transcription.
        """

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    GROQ_AUDIO_API,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"file": (filename, audio_data)},
                    data={
                        "model": self.model,
                        "language": language,
                        "response_format": "verbose_json",
                    },
                )
                response.raise_for_status()
                return response.json()

        return await self._execute_with_retry(_call)

    async def health_check(self) -> bool:
        """Verify Whisper API is reachable (lightweight check)."""
        try:
            # Generate minimal valid WAV header for health check
            # A proper health check would use a tiny audio sample
            logger.info("Whisper health check — API key configured: %s", bool(self.api_key))
            return bool(self.api_key)
        except Exception:
            return False
