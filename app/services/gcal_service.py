"""
CareOps — Google Calendar Service
Create and manage Google Calendar events for bookings.
"""

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


class GCalService:
    """Google Calendar integration for booking sync."""

    def __init__(self, supabase_client: Any):
        self.db = supabase_client

    def _get_credentials(self, workspace_id: str) -> Any:
        """Load stored OAuth credentials for the workspace."""
        result = (
            self.db.table("integrations")
            .select("credentials")
            .eq("workspace_id", workspace_id)
            .eq("provider", "gcal")
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

    def _get_service(self, workspace_id: str) -> Any | None:
        """Build a Google Calendar API service."""
        creds = self._get_credentials(workspace_id)
        if not creds:
            return None
        from googleapiclient.discovery import build
        return build("calendar", "v3", credentials=creds)

    async def create_event(
        self,
        workspace_id: str,
        booking: dict[str, Any],
        contact_name: str = "",
        contact_email: str = "",
    ) -> str | None:
        """
        Create a Google Calendar event for a booking.
        Returns the event ID or None if Calendar is not connected.
        """
        service = self._get_service(workspace_id)
        if not service:
            logger.info("📅 GCal not connected for workspace %s — skipping event creation", workspace_id)
            return None

        event = {
            "summary": f"Booking: {contact_name or 'Client'}",
            "description": booking.get("notes", ""),
            "start": {
                "dateTime": booking["starts_at"] if isinstance(booking["starts_at"], str) else booking["starts_at"].isoformat(),
                "timeZone": "Asia/Kolkata",
            },
            "end": {
                "dateTime": booking["ends_at"] if isinstance(booking["ends_at"], str) else booking["ends_at"].isoformat(),
                "timeZone": "Asia/Kolkata",
            },
            "attendees": [],
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 30},
                ],
            },
        }

        if contact_email:
            event["attendees"].append({"email": contact_email})

        try:
            result = service.events().insert(
                calendarId="primary", body=event
            ).execute()

            event_id = result.get("id", "")

            # Store gcal_event_id on the booking
            if booking.get("id"):
                self.db.table("bookings").update(
                    {"gcal_event_id": event_id}
                ).eq("id", booking["id"]).execute()

            logger.info("📅 GCal event created: %s for booking %s", event_id, booking.get("id"))
            return event_id

        except Exception as exc:
            logger.error("Failed to create GCal event: %s", exc)
            return None

    async def delete_event(
        self, workspace_id: str, event_id: str
    ) -> bool:
        """Delete a Google Calendar event."""
        service = self._get_service(workspace_id)
        if not service or not event_id:
            return False

        try:
            service.events().delete(
                calendarId="primary", eventId=event_id
            ).execute()
            logger.info("📅 GCal event deleted: %s", event_id)
            return True
        except Exception as exc:
            logger.error("Failed to delete GCal event: %s", exc)
            return False
