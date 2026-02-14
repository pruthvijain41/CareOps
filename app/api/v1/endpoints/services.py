"""
CareOps — Services API endpoints
CRUD operations for workspace services.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any
from uuid import UUID
from postgrest import SyncRequestBuilder

from app.core.dependencies import CurrentUser, SupabaseClient, get_current_user, get_supabase_client
from app.models.schemas import ServiceCreateSchema, ServiceResponse

router = APIRouter(prefix="/services", tags=["services"])

@router.get(
    "",
    response_model=list[ServiceResponse],
    summary="List business services",
)
async def list_services(
    current_user: CurrentUser,
    db: SupabaseClient,
) -> list[ServiceResponse]:
    """List all services for the user's workspace."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    result = (
        db.table("services")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("name")
        .execute()
    )
    return result.data or []

@router.post(
    "",
    response_model=ServiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new service",
)
async def create_service(
    data: ServiceCreateSchema,
    current_user: CurrentUser,
    db: SupabaseClient,
) -> ServiceResponse:
    """Create a new service in the user's workspace."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    service_data = data.dict()
    service_data["workspace_id"] = workspace_id

    result = db.table("services").insert(service_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create service")
    
    return result.data[0]

@router.patch(
    "/{service_id}",
    response_model=ServiceResponse,
    summary="Update a service",
)
async def update_service(
    service_id: UUID,
    data: dict[str, Any], # Partial update
    current_user: CurrentUser,
    db: SupabaseClient,
) -> ServiceResponse:
    """Update an existing service."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    workspace_id = profile.data["workspace_id"]

    # Verify ownership
    existing = db.table("services").select("id").eq("id", str(service_id)).eq("workspace_id", workspace_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Service not found in your workspace")

    result = db.table("services").update(data).eq("id", str(service_id)).execute()
    return result.data[0]

@router.delete(
    "/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a service",
)
async def delete_service(
    service_id: UUID,
    current_user: CurrentUser,
    db: SupabaseClient,
):
    """Delete a service."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    workspace_id = profile.data["workspace_id"]

    # Verification
    existing = db.table("services").select("id").eq("id", str(service_id)).eq("workspace_id", workspace_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Service not found in your workspace")

    db.table("services").delete().eq("id", str(service_id)).execute()
    return None


# ── Service-Inventory Linking ────────────────────────────────────────────────


@router.get(
    "/{service_id}/inventory",
    summary="List inventory items linked to a service",
)
async def list_service_inventory(
    service_id: UUID,
    current_user: CurrentUser,
    db: SupabaseClient,
) -> list[dict[str, Any]]:
    """Get all inventory items linked to a service with qty_per_use."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    workspace_id = profile.data["workspace_id"]

    # Verify service belongs to workspace
    svc = db.table("services").select("id").eq("id", str(service_id)).eq("workspace_id", workspace_id).single().execute()
    if not svc.data:
        raise HTTPException(status_code=404, detail="Service not found")

    result = (
        db.table("service_inventory")
        .select("id, service_id, item_id, qty_per_use, inventory_items(name, unit)")
        .eq("service_id", str(service_id))
        .execute()
    )

    # Flatten the joined data
    links = []
    for row in (result.data or []):
        item_info = row.get("inventory_items") or {}
        links.append({
            "id": row["id"],
            "service_id": row["service_id"],
            "item_id": row["item_id"],
            "qty_per_use": row["qty_per_use"],
            "item_name": item_info.get("name"),
            "item_unit": item_info.get("unit"),
        })

    return links


@router.put(
    "/{service_id}/inventory",
    summary="Set inventory items for a service",
    description="Replace the full list of linked inventory items for this service.",
)
async def set_service_inventory(
    service_id: UUID,
    items: list[dict[str, Any]],  # [{item_id: str, qty_per_use: int}]
    current_user: CurrentUser,
    db: SupabaseClient,
) -> list[dict[str, Any]]:
    """Replace all inventory links for a service."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    workspace_id = profile.data["workspace_id"]

    # Verify service belongs to workspace
    svc = db.table("services").select("id").eq("id", str(service_id)).eq("workspace_id", workspace_id).single().execute()
    if not svc.data:
        raise HTTPException(status_code=404, detail="Service not found")

    # Delete existing links
    db.table("service_inventory").delete().eq("service_id", str(service_id)).execute()

    # Insert new links
    if items:
        rows = [
            {
                "service_id": str(service_id),
                "item_id": str(link["item_id"]),
                "qty_per_use": link.get("qty_per_use", 1),
            }
            for link in items
        ]
        db.table("service_inventory").insert(rows).execute()

    # Return the updated list
    result = (
        db.table("service_inventory")
        .select("id, service_id, item_id, qty_per_use, inventory_items(name, unit)")
        .eq("service_id", str(service_id))
        .execute()
    )

    links = []
    for row in (result.data or []):
        item_info = row.get("inventory_items") or {}
        links.append({
            "id": row["id"],
            "service_id": row["service_id"],
            "item_id": row["item_id"],
            "qty_per_use": row["qty_per_use"],
            "item_name": item_info.get("name"),
            "item_unit": item_info.get("unit"),
        })

    return links
