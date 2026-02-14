"""
CareOps — WhatsApp Service (Bridge Wrapper)
Communicates with the Node.js Baileys bridge to send messages.
"""

import logging
from typing import Any

import httpx
from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)

class WhatsAppService(BaseExternalService):
    """Bridge wrapper for WhatsApp messaging."""

    service_name = "WhatsAppBridge"

    @staticmethod
    def normalize_phone(phone: str) -> str:
        """Clean and normalize phone number for WhatsApp.
        Strips non-digits and handles 10-digit India fallback.
        """
        if not phone:
            return ""
        
        # Strip non-digits
        clean = "".join(filter(str.isdigit, str(phone)))
        
        # Handle leading zero for Indian numbers (e.g. 09620501177 -> 919620501177)
        if len(clean) == 11 and clean.startswith("0"):
            clean = "91" + clean[1:]
        # 10-digit India fallback
        elif len(clean) == 10:
            clean = "91" + clean
            
        return clean

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)
        # We assume the bridge is running locally or at a configured URL
        self.bridge_url = getattr(self.settings, "WHATSAPP_BRIDGE_URL", "http://localhost:3001")

    async def send_message(
        self,
        chat_id: str,
        text: str,
    ) -> dict[str, Any]:
        """
        Send a text message via the WhatsApp bridge.
        """

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=15.0) as client:
                payload = {
                    "chat_id": chat_id,
                    "text": text,
                }
                response = await client.post(
                    f"{self.bridge_url}/send",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()

        try:
            return await self._execute_with_retry(_call)
        except Exception as e:
            logger.error("Failed to send WhatsApp message: %s", str(e))
            return {"success": False, "error": str(e)}

    async def logout(self) -> dict[str, Any]:
        """Log out and clear session in the bridge."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(f"{self.bridge_url}/logout")
                return response.json()
        except Exception as e:
            logger.error("Failed to logout WhatsApp: %s", str(e))
            return {"success": False, "error": str(e)}

    async def get_status(self) -> dict[str, Any]:
        """Check the connection status and get QR code if available."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.bridge_url}/status")
                return response.json()
        except Exception:
            return {"state": "disconnected", "qr": None, "error": "bridge offline"}
