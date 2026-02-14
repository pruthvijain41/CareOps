"""
CareOps — Python Enums
Mirror the PostgreSQL enum types for strict typing in the backend.
"""

from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "owner"
    STAFF = "staff"


class BookingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class MessageSource(StrEnum):
    GMAIL = "gmail"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"
    INTERNAL = "internal"


class SenderType(StrEnum):
    CONTACT = "contact"
    STAFF = "staff"
    SYSTEM = "system"


class AutomationTrigger(StrEnum):
    BOOKING_CREATED = "booking_created"
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_COMPLETED = "booking_completed"
    BOOKING_CANCELLED = "booking_cancelled"
    MESSAGE_RECEIVED = "message_received"
    FORM_SUBMITTED = "form_submitted"
    INVENTORY_LOW = "inventory_low"


class AutomationAction(StrEnum):
    SEND_EMAIL = "send_email"
    SEND_TELEGRAM = "send_telegram"
    SEND_WHATSAPP = "send_whatsapp"
    CREATE_CALENDAR_EVENT = "create_calendar_event"
    DISTRIBUTE_FORM = "distribute_form"
    ADJUST_INVENTORY = "adjust_inventory"
    NOTIFY_OWNER = "notify_owner"


class AutomationLogStatus(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"
