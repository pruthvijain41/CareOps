"""
CareOps — Telegram Bot Service
Wrapper for Telegram Bot API with retry logic.
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramService(BaseExternalService):
    """Telegram Bot API integration for messaging."""

    service_name = "TelegramBot"

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)
        self.bot_token = self.settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"{TELEGRAM_API_BASE}/bot{self.bot_token}"

    async def send_message(
        self,
        chat_id: int | str,
        text: str,
        parse_mode: str = "HTML",
        reply_to_message_id: int | None = None,
    ) -> dict[str, Any]:
        """
        Send a text message via Telegram Bot API.

        Args:
            chat_id: Target chat ID.
            text: Message text (supports HTML/Markdown).
            parse_mode: 'HTML' or 'Markdown'.
            reply_to_message_id: Optional message to reply to.

        Returns:
            Telegram API response with the sent message.
        """

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=15.0) as client:
                payload: dict[str, Any] = {
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                }
                if reply_to_message_id:
                    payload["reply_to_message_id"] = reply_to_message_id

                response = await client.post(
                    f"{self.base_url}/sendMessage",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

                if not data.get("ok"):
                    raise ConnectionError(
                        f"Telegram API error: {data.get('description', 'Unknown')}"
                    )

                logger.info("💬 Telegram message sent to %s", chat_id)
                return data

        return await self._execute_with_retry(_call)

    async def set_webhook(self, webhook_url: str) -> dict[str, Any]:
        """
        Register a webhook URL with Telegram.

        Args:
            webhook_url: HTTPS URL for receiving updates.

        Returns:
            Telegram API response.
        """

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{self.base_url}/setWebhook",
                    json={
                        "url": webhook_url,
                        "allowed_updates": ["message", "callback_query"],
                    },
                )
                response.raise_for_status()
                return response.json()

        return await self._execute_with_retry(_call)

    async def process_update(self, update: dict[str, Any]) -> dict[str, Any]:
        """
        Process an incoming Telegram update and extract relevant data.

        Args:
            update: Raw Telegram Update object.

        Returns:
            Normalized message data.
        """
        message = update.get("message", {})
        callback = update.get("callback_query", {})

        if message:
            return {
                "type": "message",
                "chat_id": message.get("chat", {}).get("id"),
                "from_id": message.get("from", {}).get("id"),
                "from_name": (
                    f"{message.get('from', {}).get('first_name', '')} "
                    f"{message.get('from', {}).get('last_name', '')}"
                ).strip(),
                "text": message.get("text", ""),
                "date": message.get("date"),
                "message_id": message.get("message_id"),
            }
        elif callback:
            return {
                "type": "callback_query",
                "chat_id": callback.get("message", {}).get("chat", {}).get("id"),
                "from_id": callback.get("from", {}).get("id"),
                "data": callback.get("data"),
                "message_id": callback.get("message", {}).get("message_id"),
            }

        logger.warning("Unknown Telegram update type: %s", update.keys())
        return {"type": "unknown", "raw": update}

    async def health_check(self) -> bool:
        """Verify Telegram Bot API connectivity."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/getMe")
                return response.status_code == 200
        except Exception:
            return False
