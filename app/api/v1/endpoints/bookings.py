"""
CareOps — Booking API endpoints
Public slot lookup, booking CRUD, and state-machine transitions.
"""

import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient
from app.models.enums import BookingStatus
from app.models.schemas import (
    BookingCreateSchema,
    BookingResponse,
    BookingTransitionSchema,
    SlotResponse,
)
from app.services.booking_state_machine import BookingStateMachine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bookings", tags=["bookings"])


# ── Public Slots ─────────────────────────────────────────────────────────────


@router.get(
    "/public/slots/{workspace_slug}",
    response_model=list[SlotResponse],
    summary="Get available booking slots",
    description="Public endpoint — returns available time slots for a workspace. No auth required.",
)
async def get_available_slots(
    workspace_slug: str,
    service_id: UUID | None = None,
    date: str | None = None,
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[SlotResponse]:
    """
    Calculate available booking slots:
    1. Look up workspace by slug
    2. Get business hours from the business_hours table
    3. Query existing bookings for the requested date
    4. Return available slots (gaps between bookings)
    """
    # Look up workspace
    ws_result = (
        db.table("workspaces")
        .select("id, settings")
        .eq("slug", workspace_slug)
        .execute()
    )

    if not ws_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{workspace_slug}' not found",
        )

    workspace_id = ws_result.data[0]["id"]
    ws_settings = ws_result.data[0].get("settings", {})
    slot_duration = ws_settings.get("slot_duration_mins", 30)

    # All times are UTC
    ws_tz = timezone.utc

    # Parse target date in UTC
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            target_date = datetime.fromisoformat(date)
            if target_date.tzinfo:
                target_date = target_date.astimezone(ws_tz).replace(tzinfo=None)
        target_utc = target_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=ws_tz)
    else:
        target_utc = datetime.now(ws_tz).replace(hour=0, minute=0, second=0, microsecond=0)

    # Python weekday: Mon=0, Sun=6 — matches our business_hours day_of_week
    day_of_week = target_utc.weekday()

    # Query business_hours table for this workspace + day
    bh_result = (
        db.table("business_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("workspace_id", workspace_id)
        .eq("day_of_week", day_of_week)
        .execute()
    )

    bh_rows = bh_result.data or []

    # If no rows found, use default: Mon-Fri 09:00-17:00
    if not bh_rows:
        if day_of_week >= 5:  # Saturday or Sunday
            return []
        bh_rows = [{"day_of_week": day_of_week, "open_time": "09:00", "close_time": "17:00", "is_open": True}]

    # Filter to open days only
    open_blocks = [r for r in bh_rows if r.get("is_open", True)]
    if not open_blocks:
        return []

    # Convert day boundaries to UTC for DB queries
    day_start_utc = target_utc
    day_end_utc = target_utc + timedelta(days=1)

    # Get existing bookings for the day
    bookings_result = (
        db.table("bookings")
        .select("starts_at, ends_at, status")
        .eq("workspace_id", workspace_id)
        .gte("starts_at", day_start_utc.isoformat())
        .lt("starts_at", day_end_utc.isoformat())
        .neq("status", BookingStatus.CANCELLED.value)
        .order("starts_at")
        .execute()
    )

    existing_bookings = bookings_result.data or []

    def _parse_dt(val: str) -> datetime:
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    now_utc = datetime.now(timezone.utc)
    slots: list[SlotResponse] = []

    # Generate slots for each business hours block (times stored as UTC)
    for block in open_blocks:
        try:
            open_h, open_m = map(int, block["open_time"].split(":"))
            close_h, close_m = map(int, block["close_time"].split(":"))
        except (ValueError, KeyError):
            continue

        # Build slot times in UTC
        current_utc = target_utc.replace(hour=open_h, minute=open_m)
        block_end_utc = target_utc.replace(hour=close_h, minute=close_m)

        while current_utc + timedelta(minutes=slot_duration) <= block_end_utc:
            slot_end_utc = current_utc + timedelta(minutes=slot_duration)

            # Skip past slots
            if current_utc < now_utc:
                current_utc = slot_end_utc
                continue

            # Check if slot overlaps with any existing booking
            is_available = not any(
                current_utc < _parse_dt(b["ends_at"])
                and slot_end_utc > _parse_dt(b["starts_at"])
                for b in existing_bookings
            )

            if is_available:
                slots.append(
                    SlotResponse(
                        starts_at=current_utc,
                        ends_at=slot_end_utc,
                        service_id=service_id,
                    )
                )

            current_utc = slot_end_utc

    return slots


# ── Business Hours CRUD ─────────────────────────────────────────────────────

# Maps frontend day IDs (mon, tue, ...) to DB day_of_week (0=Mon, 6=Sun)
_DAY_ID_TO_NUM = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
_NUM_TO_DAY_ID = {v: k for k, v in _DAY_ID_TO_NUM.items()}


class BusinessHoursBlock(BaseModel):
    open: str = "09:00"
    close: str = "17:00"


class DaySchedule(BaseModel):
    active: bool = True
    hours: list[BusinessHoursBlock] = []


class ScheduleUpdate(BaseModel):
    schedule: dict[str, DaySchedule]  # {"mon": {"active": true, "hours": [{"open":"09:00","close":"17:00"}]}, ...}


@router.get(
    "/business-hours",
    summary="Get business hours",
    description="Get business hours for the current workspace from the business_hours table.",
)
async def get_business_hours(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Return business hours in frontend-friendly format: {mon: {active, hours}, ...}"""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(403, "User profile not found")
    workspace_id = profile.data["workspace_id"]

    result = (
        db.table("business_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("workspace_id", workspace_id)
        .order("day_of_week")
        .execute()
    )

    rows = result.data or []

    # Build schedule from DB rows
    schedule: dict[str, Any] = {}

    # Initialize all days with defaults
    for day_id, day_num in _DAY_ID_TO_NUM.items():
        schedule[day_id] = {
            "active": day_num < 5,  # Mon-Fri active by default
            "hours": [{"open": "09:00", "close": "17:00"}],
        }

    # Overwrite with stored data
    for row in rows:
        day_id = _NUM_TO_DAY_ID.get(row["day_of_week"])
        if day_id:
            schedule[day_id] = {
                "active": row.get("is_open", True),
                "hours": [{"open": row["open_time"], "close": row["close_time"]}],
            }

    return {"schedule": schedule}


@router.put(
    "/business-hours",
    summary="Update business hours",
    description="Save business hours to the business_hours table.",
)
async def update_business_hours(
    data: ScheduleUpdate,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """Save schedule to business_hours table. Expects {schedule: {mon: {active, hours}, ...}}"""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(403, "User profile not found")
    workspace_id = profile.data["workspace_id"]

    for day_id, day_config in data.schedule.items():
        day_num = _DAY_ID_TO_NUM.get(day_id)
        if day_num is None:
            continue

        open_time = "09:00"
        close_time = "17:00"
        if day_config.hours:
            open_time = day_config.hours[0].open
            close_time = day_config.hours[0].close

        # Upsert: delete + insert
        db.table("business_hours").delete().eq(
            "workspace_id", workspace_id
        ).eq("day_of_week", day_num).execute()

        db.table("business_hours").insert({
            "workspace_id": workspace_id,
            "day_of_week": day_num,
            "is_open": day_config.active,
            "open_time": open_time,
            "close_time": close_time,
        }).execute()

    return {"status": "saved"}


# ── Public Services (no auth) ───────────────────────────────────────────────



@router.get(
    "/public/services/{workspace_slug}",
    summary="List public services",
    description="Public endpoint — returns services offered by a workspace. No auth required.",
)
async def list_public_services(
    workspace_slug: str,
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List active services for a workspace (public, no auth)."""
    ws_result = (
        db.table("workspaces")
        .select("id")
        .eq("slug", workspace_slug)
        .execute()
    )
    if not ws_result.data:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_slug}' not found")

    workspace_id = ws_result.data[0]["id"]

    result = (
        db.table("services")
        .select("id, name, duration_mins, price")
        .eq("workspace_id", workspace_id)
        .order("name")
        .execute()
    )
    return result.data or []


# ── List Bookings ────────────────────────────────────────────────────────────


@router.get(
    "",
    summary="List bookings",
    description="Fetch all bookings for the workspace, ordered by start time.",
)
async def list_bookings(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List all bookings for the user's workspace. Auto-completes past bookings."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    # Auto-complete past bookings that are still pending or confirmed
    now = datetime.now(timezone.utc)
    try:
        # Use simpler ISO format without fractional seconds if possible
        now_iso = now.replace(microsecond=0).isoformat()
        db.table("bookings").update({
            "status": "completed"
        }).eq("workspace_id", str(workspace_id)).in_("status", ["pending", "confirmed"]).lt("ends_at", now_iso).execute()
    except Exception as exc:
        logger.error("Failed batch auto-completing bookings for workspace %s: %s", workspace_id, exc)

    result = (
        db.table("bookings")
        .select("*, contacts(full_name, email)")
        .eq("workspace_id", workspace_id)
        .order("starts_at", desc=True)
        .limit(100)
        .execute()
    )

    return result.data or []


# ── Public Booking (no auth) ─────────────────────────────────────────────────


class PublicBookingSchema(BaseModel):
    """Schema for public booking submissions (no auth required)."""
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone: str = Field(..., min_length=5, max_length=25)
    starts_at: datetime
    ends_at: datetime
    service_id: str | None = None
    notes: str | None = None


@router.post(
    "/public/{workspace_slug}",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a public booking",
    description="No auth required. Creates a contact and booking in the workspace.",
)
async def create_public_booking(
    workspace_slug: str,
    data: PublicBookingSchema,
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> BookingResponse:
    # Look up workspace
    ws_result = (
        db.table("workspaces")
        .select("id")
        .eq("slug", workspace_slug)
        .single()
        .execute()
    )
    if not ws_result.data:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_slug}' not found")

    workspace_id = ws_result.data["id"]

    # Normalize phone
    from app.services.whatsapp_service import WhatsAppService
    phone_clean = WhatsAppService.normalize_phone(data.phone)

    # Find or create contact
    existing = None
    if phone_clean:
         # Try exact match or fuzzy match on phone
         from app.api.v1.endpoints.communications import _find_or_create_contact
         contact_obj = _find_or_create_contact(
             db=db,
             workspace_id=workspace_id,
             phone=phone_clean,
             full_name=data.name
         )
         contact_id = contact_obj["id"]
         # Link email if it was previously unknown but provided now
         if not contact_obj.get("email"):
             db.table("contacts").update({"email": data.email}).eq("id", contact_id).execute()
    else:
        # Fallback to email only (should not happen with required field)
        existing = (
            db.table("contacts")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("email", data.email)
            .limit(1)
            .execute()
        )
        if existing.data:
            contact_id = existing.data[0]["id"]
            db.table("contacts").update({"full_name": data.name}).eq("id", contact_id).execute()
        else:
            new_contact = (
                db.table("contacts")
                .insert({
                    "workspace_id": workspace_id,
                    "full_name": data.name,
                    "email": data.email,
                    "phone": phone_clean,
                    "tags": ["lead", "public-booking"],
                    "metadata": {},
                })
                .execute()
            )
            if not new_contact.data:
                raise HTTPException(status_code=500, detail="Failed to create contact")
            contact_id = new_contact.data[0]["id"]

    # Check for time conflicts
    conflicts = (
        db.table("bookings")
        .select("id")
        .eq("workspace_id", workspace_id)
        .neq("status", BookingStatus.CANCELLED.value)
        .lt("starts_at", data.ends_at.isoformat())
        .gt("ends_at", data.starts_at.isoformat())
        .execute()
    )
    if conflicts.data:
        raise HTTPException(status_code=409, detail="Time slot conflicts with an existing booking")

    # Insert booking
    booking_row: dict[str, Any] = {
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "status": BookingStatus.PENDING.value,
        "starts_at": data.starts_at.isoformat(),
        "ends_at": data.ends_at.isoformat(),
        "notes": data.notes or f"Public booking by {data.name}",
        "metadata": {},
    }
    if data.service_id:
        booking_row["service_id"] = data.service_id
    result = db.table("bookings").insert(booking_row).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create booking")

    booking = result.data[0]

    # ── Immediately deduct inventory for linked service ──
    if data.service_id:
        try:
            from app.api.v1.endpoints.inventory import deduct_inventory_for_service
            deductions = deduct_inventory_for_service(db, settings, workspace_id, data.service_id)
            if deductions:
                logger.info("📦 Auto-deducted %d inventory items for booking %s", len(deductions), booking["id"])
        except Exception as exc:
            logger.error("Inventory deduction failed for public booking: %s", exc)

    # Fire automation trigger (non-blocking)
    try:
        from app.services.automation_engine import AutomationEngine
        import asyncio
        engine = AutomationEngine(settings, db)
        asyncio.create_task(
            engine.fire_trigger(workspace_id, "booking_confirmed", {
                "booking_id": booking["id"],
                "contact_name": data.name,
                "contact_email": data.email,
                "booking_date": data.starts_at.strftime("%Y-%m-%d"),
                "booking_time": data.starts_at.strftime("%H:%M"),
            })
        )
    except Exception:
        pass

    # ── Send WhatsApp confirmation (async with retry for connection instability) ──
    logger.info("📱 Attempting WhatsApp confirmation for %s", phone_clean)
    if phone_clean:
        try:
            from app.core.config import get_settings
            from app.services.whatsapp_service import WhatsAppService
            import asyncio

            service_name = "our services"
            if data.service_id:
                svc_res = db.table("services").select("name").eq("id", data.service_id).single().execute()
                if svc_res.data:
                    service_name = svc_res.data["name"]

            booking_time = data.starts_at.strftime("%I:%M %p")
            booking_date = data.starts_at.strftime("%a, %b %d")

            wa_body = (
                f"Hi {data.name}, your booking for *{service_name}* is confirmed!\n\n"
                f"📅 *Date:* {booking_date}\n"
                f"⏰ *Time:* {booking_time}\n"
                f"📍 *Where:* {workspace_slug.capitalize()}\n\n"
                f"We look forward to seeing you!"
            )

            async def _send_wa_with_retry():
                """Retry WhatsApp send up to 3 times, waiting for connection to stabilize."""
                wa = WhatsAppService(get_settings())
                max_attempts = 3
                for attempt in range(1, max_attempts + 1):
                    try:
                        status_wa = await wa.get_status()
                        logger.info("📱 WhatsApp status check %d/%d: %s", attempt, max_attempts, status_wa.get("state"))
                        if status_wa.get("state") == "connected":
                            await wa.send_message(chat_id=phone_clean, text=wa_body)
                            logger.info("📱 Booking WhatsApp confirmation sent to %s", phone_clean)

                            # Record outgoing message in inbox
                            try:
                                from app.api.v1.endpoints.communications import _upsert_conversation, _insert_message
                                conversation = _upsert_conversation(
                                    db=db,
                                    workspace_id=workspace_id,
                                    contact_id=contact_id,
                                    channel="whatsapp",
                                    external_thread_id=f"wa_{phone_clean}",
                                    subject=f"Booking confirmation — {data.name}",
                                )
                                _insert_message(
                                    db=db,
                                    conversation_id=conversation["id"],
                                    workspace_id=workspace_id,
                                    body=wa_body,
                                    source="whatsapp",
                                    sender_type="staff",
                                    sender_id=None,
                                )
                                logger.info("📥 Outgoing WhatsApp confirmation recorded in inbox")
                            except Exception as msg_exc:
                                logger.warning("Failed to record outgoing message in inbox: %s", msg_exc)
                            return  # Success — done
                    except Exception as exc:
                        logger.warning("📱 WhatsApp send attempt %d failed: %s", attempt, exc)

                    # Wait before retrying (connection may be reconnecting after deploy)
                    if attempt < max_attempts:
                        await asyncio.sleep(5)

                logger.warning("📱 WhatsApp NOT sent after %d attempts — connection never stabilized", max_attempts)

            asyncio.create_task(_send_wa_with_retry())
        except Exception as exc:
            logger.warning("📱 Failed to queue booking WhatsApp (non-blocking): %s", exc)
    else:
        logger.warning("📱 WhatsApp NOT sent: phone_clean is empty")

    # Create Google Calendar event for the booking
    try:
        from app.services.gcal_service import GCalService
        import asyncio
        gcal = GCalService(db)
        asyncio.create_task(
            gcal.create_event(
                workspace_id=workspace_id,
                booking=booking,
                contact_name=data.name,
                contact_email=data.email,
            )
        )
    except Exception as exc:
        logger.warning("GCal sync failed for public booking (non-blocking): %s", exc)

    logger.info("📅 Public booking: %s (%s) → workspace %s", data.name, data.email, workspace_slug)
    return BookingResponse(**booking)


# ── Create Booking ───────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new booking",
    description="Create a booking and trigger the state machine (starts in 'pending' status).",
)
async def create_booking(
    data: BookingCreateSchema,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> BookingResponse:
    """
    Create a new booking:
    1. Validate contact and service exist in the workspace
    2. Check for time conflicts
    3. Insert booking with 'pending' status
    4. Return the created booking
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    # Validate contact belongs to workspace
    contact = (
        db.table("contacts")
        .select("id")
        .eq("id", str(data.contact_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not contact.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact {data.contact_id} not found in workspace",
        )

    # Check for time conflicts
    conflicts = (
        db.table("bookings")
        .select("id")
        .eq("workspace_id", workspace_id)
        .neq("status", BookingStatus.CANCELLED.value)
        .lt("starts_at", data.ends_at.isoformat())
        .gt("ends_at", data.starts_at.isoformat())
        .execute()
    )

    if conflicts.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Time slot conflicts with an existing booking",
        )

    # Insert booking
    insert_data = {
        "workspace_id": workspace_id,
        "contact_id": str(data.contact_id),
        "service_id": str(data.service_id) if data.service_id else None,
        "status": BookingStatus.PENDING.value,
        "starts_at": data.starts_at.isoformat(),
        "ends_at": data.ends_at.isoformat(),
        "notes": data.notes,
        "metadata": data.metadata,
    }

    result = db.table("bookings").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create booking",
        )

    booking = result.data[0]

    # ── Immediately deduct inventory for linked service ──
    service_id = str(data.service_id) if data.service_id else None
    if service_id:
        try:
            from app.api.v1.endpoints.inventory import deduct_inventory_for_service
            deductions = deduct_inventory_for_service(db, settings, workspace_id, service_id)
            if deductions:
                logger.info("📦 Auto-deducted %d inventory items for booking %s", len(deductions), booking["id"])
        except Exception as exc:
            logger.error("Inventory deduction failed for manual booking: %s", exc)

    # Fetch contact details for automation payload
    contact_details = (
        db.table("contacts")
        .select("full_name, email")
        .eq("id", str(data.contact_id))
        .single()
        .execute()
    )
    contact_name = contact_details.data.get("full_name", "") if contact_details.data else ""
    contact_email = contact_details.data.get("email", "") if contact_details.data else ""

    # Fire automation trigger
    from app.services.automation_engine import AutomationEngine
    engine = AutomationEngine(settings, db)
    background_tasks.add_task(
        engine.fire_trigger,
        workspace_id,
        "booking_confirmed",
        {
            "booking_id": booking["id"],
            "contact_id": str(data.contact_id),
            "contact_name": contact_name,
            "contact_email": contact_email,
            "booking_date": data.starts_at.strftime("%Y-%m-%d"),
            "booking_time": data.starts_at.strftime("%H:%M"),
        },
    )

    # Create Google Calendar event for the booking
    from app.services.gcal_service import GCalService
    gcal = GCalService(db)
    background_tasks.add_task(
        gcal.create_event,
        workspace_id=workspace_id,
        booking=booking,
        contact_name=contact_name,
        contact_email=contact_email,
    )

    return BookingResponse(**booking)


# ── State Transitions ────────────────────────────────────────────────────────


@router.patch(
    "/{booking_id}/transition",
    response_model=BookingResponse,
    summary="Transition booking status",
    description="Move a booking to a new status, triggering side-effects (GCal sync, emails, forms).",
)
async def transition_booking(
    booking_id: UUID,
    data: BookingTransitionSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> BookingResponse:
    """
    Transition a booking's status:
    1. Fetch the current booking
    2. Validate the transition via the state machine
    3. Execute transition with side-effects
    4. Return updated booking
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    # Fetch current booking
    booking = (
        db.table("bookings")
        .select("*")
        .eq("id", str(booking_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )

    if not booking.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking {booking_id} not found",
        )

    current_status = BookingStatus(booking.data["status"])

    # Execute state machine transition
    fsm = BookingStateMachine(settings)

    try:
        result = await fsm.transition(
            booking_id=booking_id,
            workspace_id=UUID(workspace_id),
            current_status=current_status,
            target_status=data.target_status,
            supabase_client=db,
            notes=data.notes,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return BookingResponse(**result["booking"])
