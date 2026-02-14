"""
CareOps — Automation API Endpoints
CRUD for automation rules, logs viewer, and manual trigger.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient
from app.services.automation_engine import AutomationEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/automation", tags=["automation"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trigger: str = Field(..., description="Trigger type: new_lead, booking_confirmed, inventory_low, etc.")
    action: str = Field(..., description="Action type: send_email, send_notification, send_form, etc.")
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    trigger: str | None = None
    action: str | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None


# ── Helper ───────────────────────────────────────────────────────────────────


def _get_workspace_id(current_user: dict, db: Any) -> str:
    profile = db.table("profiles").select("workspace_id").eq("id", current_user["id"]).single().execute()
    if not profile.data:
        raise HTTPException(403, "Profile not found")
    return profile.data["workspace_id"]


# ── List Rules ───────────────────────────────────────────────────────────────


@router.get(
    "/rules",
    summary="List automation rules",
    description="Fetch all automation rules for the workspace.",
)
async def list_automation_rules(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    workspace_id = _get_workspace_id(current_user, db)
    result = (
        db.table("automation_rules")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Normalize: DB has trigger_config/action_config, frontend expects config
    rules = []
    for r in result.data or []:
        r["config"] = {
            **(r.get("trigger_config") or {}),
            **(r.get("action_config") or {}),
        }
        rules.append(r)
    return rules


# ── Create Rule ──────────────────────────────────────────────────────────────


@router.post(
    "/rules",
    status_code=status.HTTP_201_CREATED,
    summary="Create an automation rule",
)
async def create_automation_rule(
    data: AutomationRuleCreate,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _get_workspace_id(current_user, db)
    result = (
        db.table("automation_rules")
        .insert({
            "workspace_id": workspace_id,
            "name": data.name,
            "trigger": data.trigger,
            "action": data.action,
            "action_config": data.config,
            "is_active": data.is_active,
        })
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create rule")
    return result.data[0]


# ── Update Rule ──────────────────────────────────────────────────────────────


@router.patch(
    "/rules/{rule_id}",
    summary="Update an automation rule",
)
async def update_automation_rule(
    rule_id: UUID,
    data: AutomationRuleUpdate,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _get_workspace_id(current_user, db)

    update = {}
    if data.name is not None:
        update["name"] = data.name
    if data.trigger is not None:
        update["trigger"] = data.trigger
    if data.action is not None:
        update["action"] = data.action
    if data.config is not None:
        update["action_config"] = data.config
    if data.is_active is not None:
        update["is_active"] = data.is_active

    if not update:
        raise HTTPException(400, "No fields to update")

    result = (
        db.table("automation_rules")
        .update(update)
        .eq("id", str(rule_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Rule not found")
    return result.data[0]


# ── Delete Rule ──────────────────────────────────────────────────────────────


@router.delete(
    "/rules/{rule_id}",
    summary="Delete an automation rule",
)
async def delete_automation_rule(
    rule_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    workspace_id = _get_workspace_id(current_user, db)
    db.table("automation_rules").delete().eq("id", str(rule_id)).eq("workspace_id", workspace_id).execute()
    return {"status": "deleted"}


# ── Automation Logs ──────────────────────────────────────────────────────────


@router.get(
    "/logs",
    summary="List automation execution logs",
    description="Fetch recent automation execution logs for the workspace.",
)
async def list_automation_logs(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    workspace_id = _get_workspace_id(current_user, db)
    result = (
        db.table("automation_logs")
        .select("*, automation_rules(name, trigger, action)")
        .eq("workspace_id", workspace_id)
        .order("executed_at", desc=True)
        .limit(50)
        .execute()
    )

    # Normalize: add created_at alias for frontend compatibility
    logs = []
    for log in result.data or []:
        log["created_at"] = log.get("executed_at", log.get("created_at"))
        logs.append(log)
    return logs


# ── Seed Default Rules ───────────────────────────────────────────────────────


@router.post(
    "/seed-defaults",
    summary="Seed default automation rules",
    description="Create the default set of automation rules for the workspace.",
)
async def seed_default_rules(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    workspace_id = _get_workspace_id(current_user, db)
    engine = AutomationEngine(settings, db)
    created = await engine.seed_default_rules(workspace_id)
    return {"status": "success", "rules_created": len(created)}


# ── Manual Trigger ───────────────────────────────────────────────────────────


class ManualTriggerSchema(BaseModel):
    trigger: str
    payload: dict[str, Any] = Field(default_factory=dict)


@router.post(
    "/trigger",
    summary="Manually fire an automation trigger",
)
async def manual_trigger(
    data: ManualTriggerSchema,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, str]:
    workspace_id = _get_workspace_id(current_user, db)
    engine = AutomationEngine(settings, db)

    async def _run():
        await engine.fire_trigger(workspace_id, data.trigger, data.payload)

    background_tasks.add_task(_run)
    return {"status": "triggered", "trigger": data.trigger}
