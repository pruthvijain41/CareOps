"""
CareOps — Inventory API Endpoints
Full CRUD with low-stock alerts and supplier notifications.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import CurrentUser, SupabaseClient, AppSettings
from app.models.schemas import (
    InventoryAdjustSchema,
    InventoryAlertResponse,
    InventoryAlertLogResponse,
    InventoryAdjustmentLogResponse,
    InventoryCreateSchema,
    InventoryItemResponse,
    InventoryUpdateSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_workspace_id(db: Any, user_id: str) -> str:
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    return profile.data["workspace_id"]


def deduct_inventory_for_service(
    db: Any, settings: Any, workspace_id: str, service_id: str
) -> list[dict[str, Any]]:
    """
    Immediately deduct inventory items linked to a service when a booking is created.
    Returns a list of deduction details. Fires supplier notifications for low stock.
    """
    deductions: list[dict[str, Any]] = []

    try:
        # Look up service-inventory links
        links = (
            db.table("service_inventory")
            .select("item_id, qty_per_use")
            .eq("service_id", service_id)
            .execute()
        )

        for link in (links.data or []):
            item_id = link["item_id"]
            qty_to_deduct = link["qty_per_use"]

            # Fetch current item
            item_result = (
                db.table("inventory_items")
                .select("*")
                .eq("id", str(item_id))
                .single()
                .execute()
            )

            if not item_result.data:
                logger.warning("Inventory item %s not found for deduction", item_id)
                continue

            item = item_result.data
            old_qty = item["quantity"]
            new_qty = max(0, old_qty - qty_to_deduct)

            # Update stock
            db.table("inventory_items").update(
                {"quantity": new_qty}
            ).eq("id", str(item_id)).execute()

            deductions.append({
                "item_id": item_id,
                "item_name": item["name"],
                "deducted": qty_to_deduct,
                "old_qty": old_qty,
                "new_qty": new_qty,
            })

            logger.info(
                "📦 Deducted %d %s of '%s' (was %d, now %d) for service %s",
                qty_to_deduct, item.get("unit", "units"), item["name"],
                old_qty, new_qty, service_id,
            )

            # Check low-stock alert → supplier notification + logging
            threshold = item["low_stock_threshold"]
            if new_qty <= threshold and old_qty > threshold:
                logger.warning(
                    "⚠️ LOW STOCK: '%s' dropped to %d (threshold: %d)",
                    item["name"], new_qty, threshold,
                )
                item["quantity"] = new_qty
                _trigger_inventory_alert(db, settings, workspace_id, item)

    except Exception as exc:
        logger.error("Inventory deduction failed for service %s: %s", service_id, exc)

    return deductions

# ── List ─────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=list[InventoryItemResponse],
    summary="List inventory items",
    description="Fetch all inventory items for the workspace.",
)
async def list_inventory(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[InventoryItemResponse]:
    """List all inventory items for the user's workspace."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    result = (
        db.table("inventory_items")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("name")
        .execute()
    )

    return [InventoryItemResponse(**item) for item in (result.data or [])]


# ── Create ───────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create inventory item",
)
async def create_inventory_item(
    data: InventoryCreateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> InventoryItemResponse:
    """Create a new inventory item."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    row = data.model_dump(exclude_none=True)
    row["workspace_id"] = workspace_id

    result = db.table("inventory_items").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create inventory item")

    return InventoryItemResponse(**result.data[0])


# ── Update ───────────────────────────────────────────────────────────────────


@router.patch(
    "/{item_id}",
    response_model=InventoryItemResponse,
    summary="Update inventory item",
)
async def update_inventory_item(
    item_id: UUID,
    data: InventoryUpdateSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> InventoryItemResponse:
    """Update an existing inventory item."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    updates = data.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    result = (
        db.table("inventory_items")
        .update(updates)
        .eq("id", str(item_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    return InventoryItemResponse(**result.data[0])


# ── Delete ───────────────────────────────────────────────────────────────────


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete inventory item",
)
async def delete_inventory_item(
    item_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> None:
    """Delete an inventory item."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    result = (
        db.table("inventory_items")
        .delete()
        .eq("id", str(item_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Inventory item not found")


# ── Adjust Quantity ──────────────────────────────────────────────────────────


@router.patch(
    "/{item_id}/adjust",
    response_model=InventoryAlertResponse,
    summary="Adjust inventory quantity",
    description="Add or remove stock. Triggers low-stock alerts when threshold is crossed.",
)
async def adjust_inventory(
    item_id: UUID,
    data: InventoryAdjustSchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> InventoryAlertResponse:
    """
    Adjust inventory:
    1. Fetch the item (scoped to workspace)
    2. Apply the quantity adjustment
    3. Update the database
    4. Check against low_stock_threshold
    5. Trigger alert + supplier email if threshold crossed
    """
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    # Fetch the item
    item_result = (
        db.table("inventory_items")
        .select("*")
        .eq("id", str(item_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )

    if not item_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory item {item_id} not found",
        )

    item = item_result.data
    current_qty: int = item["quantity"]
    new_qty = current_qty + data.adjustment

    if new_qty < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient stock. Current: {current_qty}, Adjustment: {data.adjustment}",
        )

    # Update quantity
    update_result = (
        db.table("inventory_items")
        .update({"quantity": new_qty})
        .eq("id", str(item_id))
        .execute()
    )

    if not update_result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update inventory",
        )

    updated_item = update_result.data[0]
    threshold: int = updated_item["low_stock_threshold"]

    # Log every adjustment for usage history
    try:
        db.table("inventory_adjustments").insert({
            "workspace_id": workspace_id,
            "item_id": str(item_id),
            "adjustment": data.adjustment,
            "quantity_before": current_qty,
            "quantity_after": new_qty,
            "reason": data.reason,
        }).execute()
    except Exception as exc:
        logger.error("Failed to log inventory adjustment: %s", exc)

    # Check low-stock alert
    is_low_stock = new_qty <= threshold
    was_above_threshold = current_qty > threshold

    alert_message = ""
    if is_low_stock and was_above_threshold:
        alert_message = (
            f"⚠️ LOW STOCK ALERT: '{updated_item['name']}' dropped to "
            f"{new_qty} {updated_item['unit']} (threshold: {threshold})"
        )
        logger.warning(alert_message)

        # Trigger automation rules + supplier notification (Email/WA) + DB Alert Log
        _trigger_inventory_alert(db, settings, workspace_id, updated_item)

    elif is_low_stock:
        alert_message = (
            f"Stock remains low: {new_qty} {updated_item['unit']} "
            f"(threshold: {threshold})"
        )

    return InventoryAlertResponse(
        item=InventoryItemResponse(**updated_item),
        alert=is_low_stock,
        message=alert_message or f"Quantity adjusted by {data.adjustment:+d} to {new_qty}",
    )


# ── Alert + Supplier Notification ────────────────────────────────────────────


def _trigger_inventory_alert(
    db: Any, settings: Any, workspace_id: str, item: dict[str, Any]
) -> None:
    """
    1. Fire automation rules with trigger='inventory_low'
    2. Log the alert persistently to 'inventory_alerts'
    3. Send supplier notifications (Email and/or WhatsApp)
    """
    # 1. Database Alert Log
    try:
        alert_type = "out_of_stock" if item["quantity"] <= 0 else "low_stock"
        db.table("inventory_alerts").insert({
            "workspace_id": workspace_id,
            "item_id": item["id"],
            "item_name": item["name"],
            "alert_type": alert_type,
            "quantity_at_alert": item["quantity"],
            "threshold": item["low_stock_threshold"],
            "supplier_notified": bool(item.get("supplier_email")) or bool(item.get("supplier_phone")),
        }).execute()
        logger.info("📄 Inventory alert logged for '%s' (%s)", item["name"], alert_type)
    except Exception as exc:
        logger.error("Failed to log inventory alert to DB: %s", exc)

    # 2. Automation Engine
    try:
        import asyncio
        from app.services.automation_engine import AutomationEngine

        engine = AutomationEngine(settings, db)
        asyncio.create_task(
            engine.fire_trigger(
                workspace_id,
                "inventory_low",
                {
                    "item_id": item["id"],
                    "item_name": item["name"],
                    "quantity": item["quantity"],
                    "unit": item.get("unit", "units"),
                    "threshold": item["low_stock_threshold"],
                },
            )
        )
    except Exception as exc:
        logger.error("Failed to trigger inventory alert automation: %s", exc)

    # Send supplier restock email
    supplier_email = item.get("supplier_email")
    if supplier_email:
        _send_supplier_notification(db, settings, workspace_id, item, supplier_email)

    # Send supplier restock WhatsApp
    supplier_phone = item.get("supplier_phone")
    if supplier_phone:
        _send_supplier_whatsapp_notification(db, settings, workspace_id, item, supplier_phone)


def _send_supplier_whatsapp_notification(
    db: Any, settings: Any, workspace_id: str, item: dict[str, Any], supplier_phone: str
) -> None:
    """Send a restock notification WhatsApp message to the supplier."""
    try:
        from app.services.whatsapp_service import WhatsAppService
        import asyncio

        # Normalize phone
        phone_clean = WhatsAppService.normalize_phone(supplier_phone)
        if not phone_clean:
            logger.warning("⚠️ Invalid supplier phone number: %s", supplier_phone)
            return

        # Look up workspace name
        ws = db.table("workspaces").select("name").eq("id", workspace_id).single().execute()
        workspace_name = ws.data["name"] if ws.data else "Unknown Workspace"

        wa = WhatsAppService(settings)
        
        # Format message
        message = (
            f"📦 *Restock Alert: {item['name']}*\n\n"
            f"Hello, this is an automated notification from *{workspace_name}*.\n\n"
            f"The following item is running low:\n"
            f"• *Item:* {item['name']}\n"
            f"• *Stock:* {item['quantity']} {item.get('unit', 'units')}\n"
            f"• *Threshold:* {item['low_stock_threshold']} {item.get('unit', 'units')}\n"
            f"• *SKU:* {item.get('sku') or 'N/A'}\n\n"
            f"Please arrange for restocking. Thank you!"
        )

        asyncio.create_task(
            wa.send_message(chat_id=phone_clean, text=message)
        )
        logger.info("📱 Supplier WhatsApp notification queued to %s for item '%s'", phone_clean, item["name"])

    except Exception as exc:
        logger.error("Failed to send supplier notification WhatsApp: %s", exc)


def _send_supplier_notification(
    db: Any, settings: Any, workspace_id: str, item: dict[str, Any], supplier_email: str
) -> None:
    """Send a restock notification email to the supplier."""
    try:
        # Look up workspace name
        ws = db.table("workspaces").select("name").eq("id", workspace_id).single().execute()
        workspace_name = ws.data["name"] if ws.data else "Unknown Workspace"

        from app.services.gmail_service import GmailService
        import asyncio
        gmail = GmailService(settings)

        subject = f"Restock Required: {item['name']}"
        body_html = (
            f"<p>Hello,</p>"
            f"<p>This is an automated notification from <strong>{workspace_name}</strong>.</p>"
            f"<p>The following item is running low and needs restocking:</p>"
            f"<ul>"
            f"<li><strong>Item:</strong> {item['name']}</li>"
            f"<li><strong>Current Stock:</strong> {item['quantity']} {item.get('unit', 'units')}</li>"
            f"<li><strong>Reorder Threshold:</strong> {item['low_stock_threshold']} {item.get('unit', 'units')}</li>"
            f"<li><strong>SKU:</strong> {item.get('sku') or 'N/A'}</li>"
            f"</ul>"
            f"<p>Please arrange for restocking at your earliest convenience.</p>"
            f"<p>Thank you,<br>{workspace_name}</p>"
        )

        asyncio.create_task(
            gmail.send_email(
                workspace_id=workspace_id,
                to=supplier_email,
                subject=subject,
                body_html=body_html,
            )
        )
        logger.info("📧 Supplier notification queued to %s for item '%s'", supplier_email, item["name"])

    except Exception as exc:
        logger.error("Failed to send supplier notification email: %s", exc)


# ── Inventory Alerts Log ─────────────────────────────────────────────────────


@router.get(
    "/alerts",
    response_model=list[InventoryAlertLogResponse],
    summary="List inventory alerts",
)
async def list_inventory_alerts(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[InventoryAlertLogResponse]:
    """List all inventory alert events for the workspace, newest first."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))
    result = (
        db.table("inventory_alerts")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return [InventoryAlertLogResponse(**r) for r in (result.data or [])]


@router.patch(
    "/alerts/{alert_id}/resolve",
    response_model=InventoryAlertLogResponse,
    summary="Resolve an inventory alert",
)
async def resolve_inventory_alert(
    alert_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> InventoryAlertLogResponse:
    """Mark an inventory alert as resolved."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))

    from datetime import datetime, timezone
    result = (
        db.table("inventory_alerts")
        .update({"resolved": True, "resolved_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", str(alert_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return InventoryAlertLogResponse(**result.data[0])


# ── Item Usage History ───────────────────────────────────────────────────────


@router.get(
    "/{item_id}/history",
    response_model=list[InventoryAdjustmentLogResponse],
    summary="Get adjustment history for an item",
)
async def get_item_history(
    item_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[InventoryAdjustmentLogResponse]:
    """Get adjustment history for a specific inventory item, newest first."""
    workspace_id = _get_workspace_id(db, current_user.get("id"))
    result = (
        db.table("inventory_adjustments")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("item_id", str(item_id))
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return [InventoryAdjustmentLogResponse(**r) for r in (result.data or [])]
