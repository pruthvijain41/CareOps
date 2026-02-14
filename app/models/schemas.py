"""
CareOps — Pydantic Schemas
Request/response models for all FastAPI endpoints.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    AutomationAction,
    AutomationLogStatus,
    AutomationTrigger,
    BookingStatus,
    MessageSource,
    SenderType,
    UserRole,
)


# ============================================================================
# Base
# ============================================================================


class CareOpsBase(BaseModel):
    """Shared model config for all schemas."""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
    )


# ============================================================================
# Workspace
# ============================================================================


class WorkspaceResponse(CareOpsBase):
    id: UUID
    name: str
    slug: str
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Profile
# ============================================================================


class ProfileResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    role: UserRole
    full_name: str | None
    avatar_url: str | None
    phone: str | None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Contact
# ============================================================================


class ContactCreateSchema(CareOpsBase):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContactResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    full_name: str
    email: str | None
    phone: str | None
    tags: list[str]
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Service
# ============================================================================


class ServiceCreateSchema(CareOpsBase):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    duration_mins: int = Field(default=60, ge=5, le=480)
    price: float | None = Field(default=None, ge=0)
    currency: str = "INR"


class ServiceResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    name: str
    description: str | None
    duration_mins: int
    price: float | None
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Inventory
# ============================================================================


class InventoryCreateSchema(CareOpsBase):
    """Schema for creating an inventory item."""

    name: str = Field(..., min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=5, ge=0)
    unit: str = Field(default="pcs", max_length=50)
    supplier_email: str | None = Field(default=None, max_length=255)
    supplier_phone: str | None = Field(default=None, max_length=50)


class InventoryUpdateSchema(CareOpsBase):
    """Schema for updating an inventory item (all fields optional)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=50)
    supplier_email: str | None = None
    supplier_phone: str | None = None


class InventoryAdjustSchema(CareOpsBase):
    """Schema for adjusting inventory quantity (positive = add, negative = remove)."""

    adjustment: int = Field(..., description="Quantity change: positive to add, negative to remove")
    reason: str | None = Field(default=None, max_length=500)


class InventoryItemResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    name: str
    sku: str | None
    quantity: int
    low_stock_threshold: int
    unit: str
    supplier_email: str | None = None
    supplier_phone: str | None = None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class InventoryAlertResponse(CareOpsBase):
    """Returned when an inventory adjustment triggers a low-stock alert."""

    item: InventoryItemResponse
    alert: bool
    message: str


class InventoryAlertLogResponse(CareOpsBase):
    """A logged inventory alert event."""
    id: UUID
    item_id: UUID
    item_name: str
    alert_type: str
    quantity_at_alert: int
    threshold: int
    supplier_notified: bool
    resolved: bool
    resolved_at: datetime | None = None
    created_at: datetime


class InventoryAdjustmentLogResponse(CareOpsBase):
    """A logged inventory adjustment event."""
    id: UUID
    item_id: UUID
    adjustment: int
    quantity_before: int
    quantity_after: int
    reason: str | None = None
    created_at: datetime


class ServiceInventoryLinkSchema(CareOpsBase):
    """Schema for linking an inventory item to a service."""
    item_id: UUID
    qty_per_use: int = Field(default=1, ge=1)


class ServiceInventoryResponse(CareOpsBase):
    """Response for a service-inventory link."""
    id: UUID
    service_id: UUID
    item_id: UUID
    qty_per_use: int
    item_name: str | None = None
    item_unit: str | None = None


# ============================================================================
# Booking
# ============================================================================


class BookingCreateSchema(CareOpsBase):
    contact_id: UUID
    service_id: UUID | None = None
    starts_at: datetime
    ends_at: datetime
    notes: str | None = Field(default=None, max_length=2000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BookingTransitionSchema(CareOpsBase):
    """Schema for transitioning a booking to a new status."""

    target_status: BookingStatus
    notes: str | None = Field(default=None, max_length=2000)


class BookingResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    contact_id: UUID
    service_id: UUID | None
    status: BookingStatus
    starts_at: datetime
    ends_at: datetime
    notes: str | None
    gcal_event_id: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SlotResponse(CareOpsBase):
    """Available booking slot."""

    starts_at: datetime
    ends_at: datetime
    service_id: UUID | None = None
    service_name: str | None = None


# ============================================================================
# Conversation & Messages
# ============================================================================


class MessageResponse(CareOpsBase):
    id: UUID
    conversation_id: UUID
    workspace_id: UUID
    sender_type: SenderType
    sender_id: UUID | None
    source: MessageSource
    body: str
    attachments: list[dict[str, Any]]
    external_id: str | None
    sent_at: datetime
    created_at: datetime


class ConversationResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    contact_id: UUID
    subject: str | None
    channel: MessageSource
    external_thread_id: str | None
    is_archived: bool
    is_read: bool = False
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = Field(default_factory=list)


class MessageReplySchema(CareOpsBase):
    body: str = Field(..., min_length=1, max_length=5000)


# ============================================================================
# Onboarding (Voice)
# ============================================================================


class VoiceInputSchema(CareOpsBase):
    """
    Metadata sent alongside the audio file upload.
    The audio binary is received via UploadFile, not in the JSON body.
    """

    language: str = Field(default="en", max_length=10)
    context: str | None = Field(
        default=None,
        description="Optional hint about what the user is configuring (e.g. 'services', 'hours')",
    )


class OnboardingStepSchema(CareOpsBase):
    """Context for a specific step in the voice onboarding wizard."""

    step: str = Field(..., description="The current step: 'workspace', 'services', 'inventory'")
    language: str = Field(default="en", max_length=10)


class OnboardingFinalizeSchema(CareOpsBase):
    """Final configuration for saving to the database."""

    workspace: dict[str, Any]
    services: list[dict[str, Any]]
    inventory: list[dict[str, Any]]


class OnboardingStepResult(CareOpsBase):
    """Result of a single onboarding step."""

    transcript: str
    extracted_data: dict[str, Any]
    next_question: str
    confidence: float


# ============================================================================
# Webhooks
# ============================================================================


class GmailWebhookPayload(CareOpsBase):
    """Google Pub/Sub push notification payload for Gmail."""

    message: dict[str, Any]
    subscription: str


class TelegramWebhookPayload(CareOpsBase):
    """Telegram Bot API Update object (simplified)."""

    update_id: int
    message: dict[str, Any] | None = None
    callback_query: dict[str, Any] | None = None


class WhatsAppWebhookPayload(CareOpsBase):
    workspace_id: UUID
    chat_id: str
    from_name: str
    text: str
    message_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Forms
# ============================================================================


class FormCreateSchema(CareOpsBase):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    schema_def: dict[str, Any] = Field(
        ..., alias="schema", description="JSON Schema defining form fields"
    )


class FormResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    title: str
    description: str | None
    form_schema: dict[str, Any] = Field(alias="schema")
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FormSubmissionCreateSchema(CareOpsBase):
    contact_id: UUID | None = None
    data: dict[str, Any]


class FormSubmissionResponse(CareOpsBase):
    id: UUID
    form_id: UUID
    workspace_id: UUID
    contact_id: UUID
    data: dict[str, Any]
    form_schema: dict[str, Any] = Field(alias="schema")
    contact: dict[str, Any] | None = None
    created_at: datetime


# ============================================================================
# Automation
# ============================================================================


class AutomationRuleCreateSchema(CareOpsBase):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    trigger: AutomationTrigger
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    action: AutomationAction
    action_config: dict[str, Any] = Field(default_factory=dict)


class AutomationRuleResponse(CareOpsBase):
    id: UUID
    workspace_id: UUID
    name: str
    description: str | None
    trigger: AutomationTrigger
    trigger_config: dict[str, Any]
    action: AutomationAction
    action_config: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AutomationLogResponse(CareOpsBase):
    id: UUID
    rule_id: UUID
    workspace_id: UUID
    status: AutomationLogStatus
    trigger_payload: dict[str, Any]
    action_result: dict[str, Any]
    error_message: str | None
    executed_at: datetime


# ============================================================================
# Generic
# ============================================================================


class PaginatedResponse(CareOpsBase):
    """Wrapper for paginated list responses."""

    items: list[Any]
    total: int
    page: int = 1
    page_size: int = 20


class ErrorResponse(CareOpsBase):
    detail: str
    error_code: str | None = None
