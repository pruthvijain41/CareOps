"""
CareOps — Google Cloud TTS Service
Wrapper for Google Cloud Text-to-Speech API.
"""

import logging
import os
from typing import Any

from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)


class TTSService(BaseExternalService):
    """Google Cloud Text-to-Speech integration."""

    service_name = "GoogleTTS"

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazy-initialize the Google Cloud TTS client."""
        if self._client is None:
            try:
                # Production: credentials JSON content is in env var
                creds_json = self.settings.GOOGLE_APPLICATION_CREDENTIALS_JSON
                if creds_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                    import tempfile
                    tmp = tempfile.NamedTemporaryFile(
                        mode="w", suffix=".json", delete=False
                    )
                    tmp.write(creds_json)
                    tmp.close()
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
                    logger.info("GCP credentials written to temp file: %s", tmp.name)

                # Dev: credentials file path is in env var
                creds_path = self.settings.GOOGLE_APPLICATION_CREDENTIALS
                if creds_path and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

                from google.cloud import texttospeech  # type: ignore[import-untyped]

                self._client = texttospeech.TextToSpeechAsyncClient()
            except ImportError:
                logger.warning(
                    "google-cloud-texttospeech not installed. TTS features unavailable."
                )
                raise
        return self._client

    async def synthesize(
        self,
        text: str,
        language_code: str = "en-US",
        voice_name: str = "en-US-Neural2-C",
        speaking_rate: float = 1.0,
    ) -> bytes:
        """
        Convert text to speech audio bytes.

        Args:
            text: The text to synthesize.
            language_code: BCP-47 language code.
            voice_name: Google Cloud voice name.
            speaking_rate: Speech speed (0.25 to 4.0).

        Returns:
            Audio content as bytes (MP3 format).
        """

        async def _call() -> bytes:
            from google.cloud import texttospeech  # type: ignore[import-untyped]

            client = self._get_client()

            synthesis_input = texttospeech.SynthesisInput(text=text)
            voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name,
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=speaking_rate,
            )

            response = await client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )

            return response.audio_content

        return await self._execute_with_retry(_call)

    async def health_check(self) -> bool:
        """Verify Google Cloud TTS connectivity."""
        try:
            self._get_client()
            return True
        except Exception:
            return False
