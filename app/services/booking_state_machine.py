"""
CareOps — Booking State Machine
Manages booking status transitions and triggers side-effects.

State diagram:
    pending ──► confirmed ──► completed
       │            │
       ▼            ▼
    cancelled    cancelled
                    │
                    ▼
                 no_show
"""

import logging
from typing import Any
from uuid import UUID

from app.models.enums import BookingStatus
from app.services.base import BaseExternalService, ExternalServiceError

logger = logging.getLogger(__name__)


# ── Valid Transitions ────────────────────────────────────────────────────────

VALID_TRANSITIONS: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.NO_SHOW,
    },
    BookingStatus.COMPLETED: set(),  # terminal state
    BookingStatus.CANCELLED: set(),  # terminal state
    BookingStatus.NO_SHOW: set(),    # terminal state
}


class InvalidTransitionError(Exception):
    """Raised when a booking transition is not allowed."""

    def __init__(self, current: BookingStatus, target: BookingStatus):
        self.current = current
        self.target = target
        super().__init__(
            f"Cannot transition booking from '{current}' to '{target}'. "
            f"Allowed: {VALID_TRANSITIONS.get(current, set())}"
        )


class BookingStateMachine(BaseExternalService):
    """
    Manages booking lifecycle transitions with side-effects.

    Each transition can trigger:
    - Google Calendar sync (create/update/delete events)
    - Email notifications (confirmation, cancellation, completion)
    - Form distribution (post-booking feedback forms)
    - Automation rule evaluation
    """

    service_name = "BookingStateMachine"

    def validate_transition(
        self,
        current_status: BookingStatus,
        target_status: BookingStatus,
    ) -> bool:
        """Check if a transition is valid. Raises InvalidTransitionError if not."""
        allowed = VALID_TRANSITIONS.get(current_status, set())
        if target_status not in allowed:
            raise InvalidTransitionError(current_status, target_status)
        return True

    async def transition(
        self,
        booking_id: UUID,
        workspace_id: UUID,
        current_status: BookingStatus,
        target_status: BookingStatus,
        supabase_client: Any,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute a booking state transition:
        1. Validate the transition is allowed
        2. Update the booking status in the database
        3. Trigger side-effects based on the transition
        4. Return transition result with side-effect outcomes
        """
        # 1. Validate
        self.validate_transition(current_status, target_status)

        # 2. Update status in DB
        update_data: dict[str, Any] = {"status": target_status.value}
        if notes:
            update_data["notes"] = notes

        result = (
            supabase_client.table("bookings")
            .update(update_data)
            .eq("id", str(booking_id))
            .eq("workspace_id", str(workspace_id))
            .execute()
        )

        if not result.data:
            raise ExternalServiceError(
                service_name=self.service_name,
                message=f"Failed to update booking {booking_id}",
            )

        updated_booking = result.data[0]

        # 3. Trigger side-effects
        side_effects = await self._execute_side_effects(
            booking=updated_booking,
            workspace_id=workspace_id,
            from_status=current_status,
            to_status=target_status,
            supabase_client=supabase_client,
        )

        return {
            "booking": updated_booking,
            "transition": f"{current_status} → {target_status}",
            "side_effects": side_effects,
        }

    async def _execute_side_effects(
        self,
        booking: dict[str, Any],
        workspace_id: UUID,
        from_status: BookingStatus,
        to_status: BookingStatus,
        supabase_client: Any,
    ) -> dict[str, Any]:
        """
        Dispatch side-effects based on the transition.
        Each effect is wrapped in try/except for graceful failure.
        """
        effects: dict[str, Any] = {}

        try:
            if to_status == BookingStatus.CONFIRMED:
                effects["gcal_sync"] = await self._on_confirmed(
                    booking, workspace_id, supabase_client
                )
                effects["confirmation_email"] = await self._on_send_confirmation(
                    booking, workspace_id
                )

            elif to_status == BookingStatus.COMPLETED:
                effects["form_distribution"] = await self._on_completed(
                    booking, workspace_id, supabase_client
                )

            elif to_status == BookingStatus.CANCELLED:
                effects["gcal_delete"] = await self._on_cancelled(
                    booking, workspace_id, supabase_client
                )
                effects["cancellation_notification"] = await self._on_send_cancellation(
                    booking, workspace_id
                )

            elif to_status == BookingStatus.NO_SHOW:
                effects["no_show_notification"] = await self._on_no_show(
                    booking, workspace_id
                )

        except ExternalServiceError as exc:
            # Graceful degradation: log but don't fail the transition
            logger.error(
                "Side-effect failed for booking %s transition %s→%s: %s",
                booking.get("id"),
                from_status,
                to_status,
                exc,
            )
            effects["error"] = str(exc)

        return effects

    # ── Side-Effect Handlers ─────────────────────────────────────────────

    async def _on_confirmed(
        self, booking: dict[str, Any], workspace_id: UUID, supabase_client: Any
    ) -> dict[str, Any]:
        """
        Triggered: pending → confirmed
        Action: Create Google Calendar event for the booking.
        """
        try:
            from app.services.gcal_service import GCalService

            gcal = GCalService(supabase_client)

            # Fetch contact details for the calendar event
            contact_name = ""
            contact_email = ""
            contact_id = booking.get("contact_id")
            if contact_id:
                try:
                    contact_result = (
                        supabase_client.table("contacts")
                        .select("full_name, email")
                        .eq("id", str(contact_id))
                        .single()
                        .execute()
                    )
                    if contact_result.data:
                        contact_name = contact_result.data.get("full_name", "")
                        contact_email = contact_result.data.get("email", "")
                except Exception:
                    pass

            event_id = await gcal.create_event(
                workspace_id=str(workspace_id),
                booking=booking,
                contact_name=contact_name,
                contact_email=contact_email,
            )

            if event_id:
                logger.info(
                    "📅 GCal event created: %s for booking %s",
                    event_id,
                    booking.get("id"),
                )
                return {"status": "created", "gcal_event_id": event_id}
            else:
                logger.info(
                    "📅 GCal not connected for workspace %s — skipped event creation",
                    workspace_id,
                )
                return {"status": "skipped", "reason": "gcal_not_connected"}

        except Exception as exc:
            logger.error("GCal event creation failed: %s", exc)
            return {"status": "failed", "error": str(exc)}

    async def _on_send_confirmation(
        self, booking: dict[str, Any], workspace_id: UUID
    ) -> dict[str, Any]:
        """
        Triggered: pending → confirmed
        Action: Send confirmation email to the contact.
        """
        # TODO: Inject GmailService and send confirmation
        logger.info(
            "📧 Sending confirmation email for booking %s",
            booking.get("id"),
        )
        return {"status": "pending_implementation", "action": "send_confirmation_email"}

    async def _on_completed(
        self,
        booking: dict[str, Any],
        workspace_id: UUID,
        supabase_client: Any,
    ) -> dict[str, Any]:
        """
        Triggered: confirmed → completed
        Actions:
        1. Distribute post-booking feedback form (TODO)

        Note: Inventory deduction happens at booking creation time
        (see deduct_inventory_for_service in inventory.py), not here,
        to ensure stock is reserved immediately when the service is booked.
        """
        logger.info(
            "✅ Booking %s completed in workspace %s.",
            booking.get("id"), workspace_id,
        )

        return {
            "status": "completed",
        }


    async def _on_cancelled(
        self, booking: dict[str, Any], workspace_id: UUID, supabase_client: Any
    ) -> dict[str, Any]:
        """
        Triggered: * → cancelled
        Action: Delete/cancel the Google Calendar event.
        """
        gcal_event_id = booking.get("gcal_event_id")
        if gcal_event_id:
            try:
                from app.services.gcal_service import GCalService

                gcal = GCalService(supabase_client)
                deleted = await gcal.delete_event(
                    workspace_id=str(workspace_id),
                    event_id=gcal_event_id,
                )

                if deleted:
                    logger.info(
                        "🗑️ GCal event deleted: %s for booking %s",
                        gcal_event_id,
                        booking.get("id"),
                    )
                    return {"status": "deleted", "gcal_event_id": gcal_event_id}
                else:
                    return {"status": "failed", "gcal_event_id": gcal_event_id}

            except Exception as exc:
                logger.error("GCal event deletion failed: %s", exc)
                return {"status": "failed", "error": str(exc)}

        return {"status": "skipped", "reason": "no_gcal_event_id"}

    async def _on_send_cancellation(
        self, booking: dict[str, Any], workspace_id: UUID
    ) -> dict[str, Any]:
        """
        Triggered: * → cancelled
        Action: Send cancellation notification.
        """
        logger.info(
            "📧 Sending cancellation notification for booking %s",
            booking.get("id"),
        )
        return {"status": "pending_implementation", "action": "send_cancellation_email"}

    async def _on_no_show(
        self, booking: dict[str, Any], workspace_id: UUID
    ) -> dict[str, Any]:
        """
        Triggered: confirmed → no_show
        Action: Log and notify workspace owner.
        """
        logger.info(
            "🚫 No-show recorded for booking %s",
            booking.get("id"),
        )
        return {"status": "pending_implementation", "action": "notify_no_show"}
