"""
CareOps — Dashboard API Endpoints
Aggregated metrics and urgent action feed for the workspace cockpit.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import CurrentUser, SupabaseClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/metrics",
    summary="Get dashboard metrics",
    description="Fetch real-time metric counters for the dashboard grid.",
)
async def get_dashboard_metrics(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Fetch dashboard metrics:
    1. Today's Bookings
    2. Active Conversations (Unread signals)
    3. Form Submissions
    4. Low Stock Items
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # 1. Today's Bookings
    bookings = db.table("bookings").select("id", count="exact").eq("workspace_id", workspace_id).gte("starts_at", today_start).lt("starts_at", today_end).neq("status", "cancelled").execute()
    
    # 2. Unread Messages (conversations not yet read by staff)
    conversations = db.table("conversations").select("id", count="exact").eq("workspace_id", workspace_id).eq("is_read", False).execute()

    # 3. Pending Forms (submissions not yet read/reviewed)
    forms = db.table("form_submissions").select("id", count="exact").eq("workspace_id", workspace_id).eq("is_read", False).execute()

    # 4. Low Stock Items
    inventory = db.table("inventory_items").select("quantity, low_stock_threshold").eq("workspace_id", workspace_id).execute()
    low_stock_count = sum(1 for item in (inventory.data or []) if item["quantity"] <= item["low_stock_threshold"])

    # 5. Weekly Analytics (Last 7 Days)
    week_ago = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    weekly_res = db.table("bookings").select("starts_at, status, service_id").eq("workspace_id", workspace_id).gte("starts_at", week_ago.isoformat()).neq("status", "cancelled").execute()
    services_res = db.table("services").select("id, price").eq("workspace_id", workspace_id).execute()
    price_map = {s["id"]: s["price"] for s in (services_res.data or [])}

    weekly_stats = []
    for i in range(7):
        day_date = week_ago + timedelta(days=i)
        day_start = day_date.strftime("%Y-%m-%d")
        
        day_bookings = [b for b in (weekly_res.data or []) if b["starts_at"].startswith(day_start)]
        revenue = sum(price_map.get(b["service_id"], 0) for b in day_bookings)
        
        weekly_stats.append({
            "day": day_date.strftime("%a"),
            "bookings": len(day_bookings),
            "revenue": int(revenue)
        })

    # 6. Booking Status Distribution (for the "Task Progress" chart)
    # We'll use all bookings for a broader picture
    status_res = db.table("bookings").select("status").eq("workspace_id", workspace_id).execute()
    all_bookings = status_res.data or []
    total_b = len(all_bookings)
    
    distribution = [
        {"name": "Completed", "value": sum(1 for b in all_bookings if b["status"] == "completed"), "color": "#10b981"},
        {"name": "Pending", "value": sum(1 for b in all_bookings if b["status"] == "pending"), "color": "#3b82f6"},
        {"name": "Cancelled", "value": sum(1 for b in all_bookings if b["status"] == "cancelled"), "color": "#f59e0b"},
    ]
    
    # Calculate percentage if total > 0
    if total_b > 0:
        for d in distribution:
            d["value"] = round((d["value"] / total_b) * 100)
    else:
        distribution = [
            {"name": "Completed", "value": 0, "color": "#10b981"},
            {"name": "Pending", "value": 0, "color": "#3b82f6"},
            {"name": "Cancelled", "value": 0, "color": "#f59e0b"},
        ]

    return {
        "bookings_today": bookings.count or 0,
        "unread_messages": conversations.count or 0,
        "pending_forms": forms.count or 0,
        "low_stock_items": low_stock_count,
        "weekly_analytics": weekly_stats,
        "booking_distribution": distribution,
        "completion_rate": distribution[0]["value"] if total_b > 0 else 0
    }



@router.get(
    "/actions",
    summary="Get urgent action feed",
    description="Fetch a list of urgent items requiring operator attention.",
)
async def get_action_feed(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """
    Generate action feed items:
    - New Leads (based on recent forms)
    - Low Stock Alerts
    - Urgent Bookings
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    workspace_id = profile.data["workspace_id"]

    actions = []

    # 1. Low Stock Items (as actions)
    inventory = db.table("inventory_items").select("id, name, quantity, unit, low_stock_threshold").eq("workspace_id", workspace_id).execute()
    for item in (inventory.data or []):
        if item["quantity"] <= item["low_stock_threshold"]:
            actions.append({
                "id": f"inv_{item['id']}",
                "type": "inventory_alert",
                "title": f"LOW STOCK: {item['name']}",
                "description": f"Remaining: {item['quantity']} {item['unit']}",
                "severity": "rose",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    # 2. Recent Form Submissions (New Leads)
    now = datetime.now(timezone.utc)
    recent = (now - timedelta(hours=12)).isoformat()
    forms = db.table("form_submissions").select("id, created_at, data").eq("workspace_id", workspace_id).gte("created_at", recent).order("created_at", desc=True).limit(5).execute()
    for f in (forms.data or []):
        actions.append({
            "id": f"form_{f['id']}",
            "type": "lead",
            "title": "NEW FORM SUBMISSION",
            "description": f"Received at {f['created_at']}",
            "severity": "amber",
            "timestamp": f["created_at"],
        })

    # Sort by timestamp
    actions.sort(key=lambda x: x["timestamp"], reverse=True)

    return actions[:10]


@router.get(
    "/insights",
    summary="Get AI-powered dashboard insights",
    description="Generate smart, actionable insights by analyzing workspace data with AI.",
)
async def get_dashboard_insights(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """
    Aggregate workspace data and send to Groq for smart insight generation.
    Returns 2-3 actionable recommendations.
    """
    from app.core.config import Settings
    from app.services.groq_service import GroqService
    import json

    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    # Gather data for AI analysis
    try:
        # Today's bookings
        bookings_today = db.table("bookings").select("id", count="exact").eq("workspace_id", workspace_id).gte("starts_at", today_start).lt("starts_at", today_end).neq("status", "cancelled").execute()

        # This week's bookings
        bookings_week = db.table("bookings").select("id, status, starts_at").eq("workspace_id", workspace_id).gte("starts_at", week_ago).execute()

        # No-shows this week
        no_shows = [b for b in (bookings_week.data or []) if b.get("status") == "no_show"]

        # Unread messages
        conversations = db.table("conversations").select("id", count="exact").eq("workspace_id", workspace_id).eq("is_read", False).execute()

        # Low stock items
        inventory = db.table("inventory_items").select("name, quantity, low_stock_threshold, unit").eq("workspace_id", workspace_id).execute()
        low_stock = [i for i in (inventory.data or []) if i["quantity"] <= i["low_stock_threshold"]]

        # Pending forms (unread)
        forms = db.table("form_submissions").select("id", count="exact").eq("workspace_id", workspace_id).eq("is_read", False).execute()

        # Build context for AI
        data_summary = {
            "bookings_today": bookings_today.count or 0,
            "bookings_this_week": len(bookings_week.data or []),
            "no_shows_this_week": len(no_shows),
            "unread_messages": conversations.count or 0,
            "pending_forms": forms.count or 0,
            "low_stock_items": [{"name": i["name"], "qty": i["quantity"], "unit": i["unit"]} for i in low_stock],
            "total_inventory_items": len(inventory.data or []),
            "current_day": now.strftime("%A"),
            "current_time": now.strftime("%I:%M %p"),
        }

        settings = Settings()
        if not settings.GROQ_API_KEY:
            return []

        groq = GroqService(settings)

        system_prompt = (
            "You are a smart business analytics assistant for CareOps, a service-based business operations platform.\n"
            "You analyze workspace data and provide 2-3 short, actionable insights.\n\n"
            "RULES:\n"
            "- Each insight should be 1-2 sentences max, written in plain, friendly language.\n"
            "- Focus on things the business owner can ACT on right now.\n"
            "- Use specific numbers from the data.\n"
            "- Don't be generic. Be specific and helpful.\n"
            "- If there are no issues, give positive reinforcement or optimization tips.\n\n"
            "For each insight, also assign one icon_type from: trend_up, trend_down, lightbulb, alert, clock\n\n"
            "OUTPUT VALID JSON array:\n"
            '[{"text": "Your insight here", "icon_type": "lightbulb"}, ...]'
        )

        result = await groq.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is today's workspace data:\n{json.dumps(data_summary, indent=2)}"},
            ],
            temperature=0.6,
            max_tokens=512,
            response_format={"type": "json_object"},
        )

        # Parse the response
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "[]")
        parsed = json.loads(content)

        # Handle both array and object with "insights" key
        if isinstance(parsed, list):
            insights = parsed[:3]
        elif isinstance(parsed, dict) and "insights" in parsed:
            insights = parsed["insights"][:3]
        else:
            insights = []

        return insights

    except Exception as e:
        logger.warning(f"AI insights generation failed: {e}")
        return []
