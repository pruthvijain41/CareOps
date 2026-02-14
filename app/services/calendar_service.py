"""
CareOps — Google Calendar Service
Wrapper for Google Calendar API with retry logic.
"""

import logging
from datetime import datetime
from typing import Any

from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)


class CalendarService(BaseExternalService):
    """Google Calendar API integration for booking sync."""

    service_name = "GoogleCalendar"

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)

    async def _get_service(self, credentials: dict[str, Any] | None = None) -> Any:
        """
        Build and return a Google Calendar API service instance.
        Credentials should come from the workspace's stored OAuth tokens.
        """
        # TODO: Implement OAuth token management per workspace
        raise NotImplementedError("Calendar OAuth flow not yet implemented")

    async def create_event(
        self,
        summary: str,
        start_time: datetime,
        end_time: datetime,
        description: str | None = None,
        attendee_email: str | None = None,
        calendar_id: str = "primary",
        credentials: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Create a Google Calendar event.

        Args:
            summary: Event title.
            start_time: Event start datetime.
            end_time: Event end datetime.
            description: Optional event description.
            attendee_email: Optional attendee email to invite.
            calendar_id: Target calendar (default: primary).
            credentials: OAuth credentials for the workspace.

        Returns:
            Created event data including the event ID.
        """

        async def _call() -> dict[str, Any]:
            service = await self._get_service(credentials)

            event_body: dict[str, Any] = {
                "summary": summary,
                "start": {
                    "dateTime": start_time.isoformat(),
                    "timeZone": "UTC",
                },
                "end": {
                    "dateTime": end_time.isoformat(),
                    "timeZone": "UTC",
                },
            }

            if description:
                event_body["description"] = description

            if attendee_email:
                event_body["attendees"] = [{"email": attendee_email}]

            result = (
                service.events()
                .insert(calendarId=calendar_id, body=event_body, sendUpdates="all")
                .execute()
            )

            logger.info("📅 Calendar event created: %s", result.get("id"))
            return result

        return await self._execute_with_retry(_call)

    async def delete_event(
        self,
        event_id: str,
        calendar_id: str = "primary",
        credentials: dict[str, Any] | None = None,
    ) -> bool:
        """
        Delete a Google Calendar event.

        Args:
            event_id: The event ID to delete.
            calendar_id: Target calendar.
            credentials: OAuth credentials for the workspace.

        Returns:
            True if deletion was successful.
        """

        async def _call() -> bool:
            service = await self._get_service(credentials)
            service.events().delete(
                calendarId=calendar_id,
                eventId=event_id,
                sendUpdates="all",
            ).execute()

            logger.info("🗑️ Calendar event deleted: %s", event_id)
            return True

        return await self._execute_with_retry(_call)

    async def get_free_busy(
        self,
        start_time: datetime,
        end_time: datetime,
        calendar_id: str = "primary",
        credentials: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        """
        Query free/busy information for a calendar.

        Args:
            start_time: Query window start.
            end_time: Query window end.
            calendar_id: Target calendar.
            credentials: OAuth credentials for the workspace.

        Returns:
            List of busy time ranges [{start, end}].
        """

        async def _call() -> list[dict[str, str]]:
            service = await self._get_service(credentials)

            body = {
                "timeMin": start_time.isoformat() + "Z",
                "timeMax": end_time.isoformat() + "Z",
                "items": [{"id": calendar_id}],
            }

            result = service.freebusy().query(body=body).execute()
            busy_ranges = result.get("calendars", {}).get(calendar_id, {}).get("busy", [])

            logger.info(
                "📅 Free/busy query: %d busy slots between %s and %s",
                len(busy_ranges),
                start_time,
                end_time,
            )
            return busy_ranges

        return await self._execute_with_retry(_call)

    async def health_check(self) -> bool:
        """Check if Calendar credentials are configured."""
        return bool(
            self.settings.GCAL_CLIENT_ID and self.settings.GCAL_CLIENT_SECRET
        )
