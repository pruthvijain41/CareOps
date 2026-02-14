"""
CareOps — Gmail API Service
Sends emails via Gmail API using stored OAuth credentials.
"""

import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from google.oauth2.credentials import Credentials

from app.core.config import Settings

logger = logging.getLogger(__name__)


class GmailService:
    """Gmail API integration for sending emails."""

    def __init__(self, settings: Settings | None = None, supabase_client: Any = None):
        self.settings = settings
        self.db = supabase_client

    def _get_credentials(self, workspace_id: str) -> Credentials | None:
        """Load stored OAuth credentials for the workspace."""
        if not self.db:
            return None

        try:
            result = (
                self.db.table("integrations")
                .select("credentials, connected_email")
                .eq("workspace_id", workspace_id)
                .eq("provider", "gmail")
                .eq("is_active", True)
                .single()
                .execute()
            )

            if not result.data:
                return None

            creds_data = result.data["credentials"]
            from google.oauth2.credentials import Credentials
            creds = Credentials(
                token=creds_data.get("token"),
                refresh_token=creds_data.get("refresh_token"),
                token_uri=creds_data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=creds_data.get("client_id"),
                client_secret=creds_data.get("client_secret"),
            )
            return creds

        except Exception as exc:
            logger.error("Failed to load Gmail credentials: %s", exc)
            return None

    def _get_service(self, workspace_id: str) -> Any | None:
        """Build a Gmail API service using stored OAuth credentials."""
        creds = self._get_credentials(workspace_id)
        if not creds:
            return None
        from googleapiclient.discovery import build
        return build("gmail", "v1", credentials=creds)

    async def is_connected(self, workspace_id: str) -> bool:
        """Check if Gmail is connected for this workspace."""
        return self._get_credentials(workspace_id) is not None

    async def get_connected_email(self, workspace_id: str) -> str | None:
        """Get the email address of the connected Gmail account."""
        if not self.db:
            return None
        try:
            result = (
                self.db.table("integrations")
                .select("connected_email")
                .eq("workspace_id", workspace_id)
                .eq("provider", "gmail")
                .eq("is_active", True)
                .single()
                .execute()
            )
            return result.data.get("connected_email") if result.data else None
        except Exception:
            return None

    async def send_email(
        self,
        workspace_id: str,
        to: str,
        subject: str,
        body_html: str,
        from_email: str | None = None,
    ) -> dict[str, Any]:
        """
        Send an email via Gmail API using the workspace's stored credentials.

        Returns:
            Dict with message ID and status, or error info.
        """
        service = self._get_service(workspace_id)
        if not service:
            logger.warning("📧 Gmail not connected for workspace %s — email to %s skipped", workspace_id, to)
            return {"status": "skipped", "reason": "Gmail not connected"}

        try:
            message = MIMEMultipart("alternative")
            message["to"] = to
            message["subject"] = subject
            if from_email:
                message["from"] = from_email

            # Create both plain text and HTML parts
            plain_text = body_html.replace("<br>", "\n").replace("<br/>", "\n")
            # Strip simple HTML tags for plain text fallback
            import re
            plain_text = re.sub(r"<[^>]+>", "", plain_text)

            message.attach(MIMEText(plain_text, "plain"))
            message.attach(MIMEText(body_html, "html"))

            raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
            result = (
                service.users()
                .messages()
                .send(userId="me", body={"raw": raw})
                .execute()
            )

            logger.info("📧 Email sent to %s — Message ID: %s", to, result.get("id"))
            return {"status": "sent", "message_id": result.get("id"), "to": to}

        except Exception as exc:
            logger.error("📧 Failed to send email to %s: %s", to, exc)
            return {"status": "error", "error": str(exc), "to": to}

    async def process_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Decode a Gmail Pub/Sub push notification.
        """
        try:
            message = payload.get("message", {})
            data = message.get("data")
            if not data:
                return {"error": "No data in pubsub message"}

            import json
            decoded = base64.b64decode(data).decode("utf-8")
            data_json = json.loads(decoded)
            return data_json
        except Exception as exc:
            logger.error("Failed to process Gmail webhook: %s", exc)
            return {"error": str(exc)}

    async def fetch_message(self, workspace_id: str, message_id: str) -> dict[str, Any]:
        """
        Fetch full message details from Gmail API.
        """
        service = self._get_service(workspace_id)
        if not service:
            return {"error": "Gmail not connected"}

        try:
            msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
            payload = msg.get("payload", {})
            headers = payload.get("headers", [])

            subject = "No Subject"
            for h in headers:
                if h["name"].lower() == "subject":
                    subject = h["value"]
                    break

            # Extract body
            body = ""
            if "parts" in payload:
                for part in payload["parts"]:
                    if part["mimeType"] == "text/plain":
                        data = part["body"].get("data", "")
                        body = base64.urlsafe_b64decode(data).decode("utf-8")
                        break
                    elif part["mimeType"] == "text/html" and not body:
                        data = part["body"].get("data", "")
                        body = base64.urlsafe_b64decode(data).decode("utf-8")
            else:
                data = payload["body"].get("data", "")
                if data:
                    body = base64.urlsafe_b64decode(data).decode("utf-8")

            return {
                "subject": subject,
                "body": body,
                "snippet": msg.get("snippet", ""),
                "id": msg.get("id"),
                "threadId": msg.get("threadId"),
            }
        except Exception as exc:
            logger.error("Failed to fetch Gmail message %s: %s", message_id, exc)
            return {"error": str(exc)}

    async def health_check(self, workspace_id: str) -> bool:
        """Check if Gmail is connected and credentials are valid."""
        return await self.is_connected(workspace_id)
