"""
CareOps — Automation Scheduler Service
Background task that runs periodically to fire timed automation triggers:
  - Booking reminders (24h before appointment)
  - Pending form reminders (form sent but not completed after 24h)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)


class AutomationScheduler:
    """
    Periodically checks for timed automation events and fires triggers.
    Designed to be started in FastAPI lifespan and cancelled on shutdown.
    """

    def __init__(self, settings: Any, interval_seconds: int = 60):
        self.settings = settings
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        """Start the scheduler background loop."""
        self._task = asyncio.create_task(self._loop())
        logger.info("⏰ AutomationScheduler started (interval=%ds)", self.interval_seconds)

    async def stop(self) -> None:
        """Cancel the scheduler."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("⏰ AutomationScheduler stopped")

    # ── Main Loop ────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        """Run checks in a loop, sleeping between iterations."""
        # Wait a few seconds on startup to let the app initialize
        await asyncio.sleep(5)

        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("⏰ Scheduler tick failed: %s", exc, exc_info=True)

            await asyncio.sleep(self.interval_seconds)

    async def _tick(self) -> None:
        """Single scheduler tick — check for pending timed events."""
        from supabase import create_client

        db = create_client(self.settings.SUPABASE_URL, self.settings.SUPABASE_SERVICE_ROLE_KEY)

        await self._check_booking_reminders(db)
        await self._check_pending_form_reminders(db)

    # ── Booking Reminders ────────────────────────────────────────────────

    async def _check_booking_reminders(self, db: Any) -> None:
        """
        Find bookings starting in the next 24 hours that haven't been
        reminded yet, and fire the booking_reminder trigger for each.
        """
        now = datetime.now(timezone.utc)
        reminder_window_start = now
        reminder_window_end = now + timedelta(hours=24)

        try:
            # Find upcoming confirmed bookings that haven't been reminded
            bookings = (
                db.table("bookings")
                .select("*, contacts(full_name, email, phone)")
                .eq("status", "confirmed")
                .gte("starts_at", reminder_window_start.isoformat())
                .lte("starts_at", reminder_window_end.isoformat())
                .execute()
            )

            if not bookings.data:
                return

            for booking in bookings.data:
                metadata = booking.get("metadata", {}) or {}

                # Skip if already reminded
                if metadata.get("reminder_sent"):
                    continue

                contact = booking.get("contacts", {}) or {}
                contact_email = contact.get("email", "")
                contact_name = contact.get("full_name", "Customer")

                if not contact_email:
                    continue

                workspace_id = booking["workspace_id"]

                # Check if automation is paused for this contact's conversation
                if await self._is_automation_paused(db, workspace_id, booking.get("contact_id")):
                    logger.info("⏰ Skipping reminder for %s — automation paused", contact_name)
                    continue

                # Fire the booking_reminder trigger
                try:
                    from app.services.automation_engine import AutomationEngine
                    engine = AutomationEngine(self.settings, db)

                    starts_at = datetime.fromisoformat(booking["starts_at"].replace("Z", "+00:00"))
                    booking_date = starts_at.strftime("%B %d, %Y")
                    booking_time = starts_at.strftime("%I:%M %p")

                    await engine.fire_trigger(
                        workspace_id,
                        "booking_reminder",
                        {
                            "contact_name": contact_name,
                            "contact_email": contact_email,
                            "contact_phone": contact.get("phone", ""),
                            "booking_date": booking_date,
                            "booking_time": booking_time,
                            "booking_id": booking["id"],
                        },
                    )

                    # Mark as reminded in metadata
                    metadata["reminder_sent"] = True
                    metadata["reminder_sent_at"] = now.isoformat()
                    db.table("bookings").update({"metadata": metadata}).eq("id", booking["id"]).execute()

                    logger.info("⏰ Booking reminder sent for %s (%s)", contact_name, booking_date)

                except Exception as exc:
                    logger.error("⏰ Failed to send booking reminder: %s", exc)

        except Exception as exc:
            logger.error("⏰ Failed to check booking reminders: %s", exc)

    # ── Pending Form Reminders ───────────────────────────────────────────

    async def _check_pending_form_reminders(self, db: Any) -> None:
        """
        Find automation logs where a form was sent (distribute_form action)
        more than 24 hours ago, but the contact hasn't submitted the form yet.
        Send a reminder.
        """
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=24)

        try:
            # Find form-distribution logs from >24h ago
            logs = (
                db.table("automation_logs")
                .select("*, automation_rules(name, trigger, action, action_config)")
                .eq("status", "success")
                .lte("executed_at", cutoff.isoformat())
                .limit(50)
                .execute()
            )

            if not logs.data:
                return

            for log in logs.data:
                rule = log.get("automation_rules", {}) or {}
                action = rule.get("action", "")

                # Only process distribute_form actions
                if action != "distribute_form":
                    continue

                action_result = log.get("action_result", {}) or {}
                form_id = action_result.get("form_id")
                payload = log.get("trigger_payload", {}) or {}
                contact_email = payload.get("contact_email", "")
                contact_name = payload.get("contact_name", "")
                workspace_id = log.get("workspace_id", "")

                if not form_id or not contact_email:
                    continue

                # Check if this reminder was already sent
                metadata = log.get("metadata", {}) or {}
                if metadata.get("form_reminder_sent"):
                    continue

                # Check if the contact already submitted the form
                submissions = (
                    db.table("form_submissions")
                    .select("id")
                    .eq("form_id", form_id)
                    .limit(1)
                    .execute()
                )

                # Filter by contact — check if any submission has matching contact
                contact_submitted = False
                if submissions.data:
                    # Check by contact_id if available
                    contact_id = payload.get("contact_id")
                    if contact_id:
                        contact_sub = (
                            db.table("form_submissions")
                            .select("id")
                            .eq("form_id", form_id)
                            .eq("contact_id", contact_id)
                            .limit(1)
                            .execute()
                        )
                        contact_submitted = bool(contact_sub.data)

                if contact_submitted:
                    continue

                # Check if automation is paused
                contact_id_val = payload.get("contact_id")
                if contact_id_val and await self._is_automation_paused(db, workspace_id, contact_id_val):
                    continue

                # Fire form_submitted reminder (reuse send_email action)
                try:
                    from app.services.automation_engine import AutomationEngine
                    engine = AutomationEngine(self.settings, db)

                    form_title = action_result.get("form_title", "Form")
                    form_url = f"http://localhost:3000/f/{form_id}"

                    await engine.fire_trigger(
                        workspace_id,
                        "form_submitted",  # Use existing trigger to find reminder rules
                        {
                            "contact_name": contact_name,
                            "contact_email": contact_email,
                            "form_title": form_title,
                            "form_url": form_url,
                            "_is_reminder": True,
                        },
                    )

                    logger.info("⏰ Pending form reminder sent for %s — form: %s", contact_name, form_title)

                except Exception as exc:
                    logger.error("⏰ Failed to send form reminder: %s", exc)

        except Exception as exc:
            logger.error("⏰ Failed to check pending form reminders: %s", exc)

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _is_automation_paused(self, db: Any, workspace_id: str, contact_id: str | None) -> bool:
        """Check if automation is paused for a given contact's conversation."""
        if not contact_id:
            return False

        try:
            conv = (
                db.table("conversations")
                .select("automation_paused")
                .eq("workspace_id", workspace_id)
                .eq("contact_id", contact_id)
                .limit(1)
                .execute()
            )
            if conv.data and conv.data[0].get("automation_paused"):
                return True
        except Exception:
            # If column doesn't exist yet, just proceed
            pass

        return False
