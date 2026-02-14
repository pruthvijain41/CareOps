"""
CareOps — Onboarding API Endpoints
Conversational chat-based onboarding with voice + text support.
"""

import io
import json
import logging
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient
from app.services.groq_service import GroqService
from app.services.whisper_service import WhisperService
from app.services.tts_service import TTSService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    collected: dict[str, Any] = {
        "business_name": None,
        "address": None,
        "timezone": None,
        "contact_email": None,
        "services": [],
        "business_hours": [],
        "_phase": "collecting",
    }


class ChatResponse(BaseModel):
    reply: str
    extracted: dict[str, Any]
    phase: str  # "collecting", "services", "hours", "gmail", "whatsapp", "done"


class ServiceItem(BaseModel):
    name: str
    duration_mins: int = 60
    price: float = 0
    currency: str = "INR"


class BusinessHourItem(BaseModel):
    day: str
    open: str = "09:00"
    close: str = "17:00"


class FinalizeRequest(BaseModel):
    business_name: str
    address: str
    timezone: str
    contact_email: str
    services: list[dict[str, Any]] = []
    business_hours: list[dict[str, Any]] = []


# ── Chat Endpoint (text) ────────────────────────────────────────────────────


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Conversational onboarding chat",
    description="Send conversation history, get AI reply and extracted business data.",
)
async def onboarding_chat(
    data: ChatRequest,
    settings: AppSettings = None,  # type: ignore[assignment]
) -> ChatResponse:
    """Process a conversational onboarding message."""
    groq = GroqService(settings)

    # Convert to plain dicts for the LLM
    messages = [{"role": m.role, "content": m.content} for m in data.messages]

    llm_result = await groq.parse_onboarding_chat(
        messages=messages,
        collected_so_far=data.collected,
    )

    content_str = (
        llm_result.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "{}")
    )

    try:
        parsed = json.loads(content_str)
    except json.JSONDecodeError:
        parsed = {
            "reply": "Sorry, I didn't catch that. Could you try again?",
            "extracted": {},
            "phase": data.collected.get("_phase", "collecting"),
        }

    return ChatResponse(
        reply=parsed.get("reply", "Could you tell me a bit more?"),
        extracted=parsed.get("extracted", {}),
        phase=parsed.get("phase", data.collected.get("_phase", "collecting")),
    )


# ── Chat Endpoint (voice) ───────────────────────────────────────────────────


@router.post(
    "/chat-voice",
    response_model=ChatResponse,
    summary="Voice-based conversational onboarding",
    description="Upload audio, transcribe, and process as chat.",
)
async def onboarding_chat_voice(
    audio: UploadFile = File(..., description="Audio file"),
    messages: str = Form(default="[]", description="JSON array of previous messages"),
    collected: str = Form(
        default='{"business_name":null,"address":null,"timezone":null,"contact_email":null,"services":[],"business_hours":[],"_phase":"collecting"}',
        description="JSON object of already collected fields",
    ),
    language: str = Form(default="en", description="Language code"),
    settings: AppSettings = None,  # type: ignore[assignment]
) -> ChatResponse:
    """Transcribe audio then process as conversational chat."""
    audio_data = await audio.read()
    filename = audio.filename or "audio.wav"

    # 1. Transcribe
    whisper = WhisperService(settings)
    transcription_result = await whisper.transcribe(
        audio_data=audio_data,
        filename=filename,
        language=language,
    )
    transcript = transcription_result.get("text", "")

    if not transcript.strip():
        return ChatResponse(
            reply="I couldn't hear anything. Could you try speaking again?",
            extracted={},
            phase="collecting",
        )

    # 2. Parse conversation history
    try:
        msg_list = json.loads(messages)
    except json.JSONDecodeError:
        msg_list = []

    try:
        collected_dict = json.loads(collected)
    except json.JSONDecodeError:
        collected_dict = {
            "business_name": None,
            "address": None,
            "timezone": None,
            "contact_email": None,
            "services": [],
            "business_hours": [],
            "_phase": "collecting",
        }

    # Add user's transcribed message
    msg_list.append({"role": "user", "content": transcript})

    # 3. Send to conversational LLM
    groq = GroqService(settings)
    llm_result = await groq.parse_onboarding_chat(
        messages=msg_list,
        collected_so_far=collected_dict,
    )

    content_str = (
        llm_result.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "{}")
    )

    try:
        parsed = json.loads(content_str)
    except json.JSONDecodeError:
        parsed = {
            "reply": "Sorry, I didn't catch that. Could you try again?",
            "extracted": {},
            "phase": collected_dict.get("_phase", "collecting"),
        }

    return ChatResponse(
        reply=parsed.get("reply", "Could you tell me a bit more?"),
        extracted=parsed.get("extracted", {}),
        phase=parsed.get("phase", collected_dict.get("_phase", "collecting")),
    )


# ── Finalize ─────────────────────────────────────────────────────────────────


DAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


@router.post(
    "/finalize",
    summary="Finalize onboarding",
    description="Save the collected workspace identity to the database.",
)
async def finalize_onboarding(
    data: FinalizeRequest,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, str]:
    """Save workspace config, services, and business hours. Mark onboarding complete."""
    user_id = current_user.get("id")
    user_email = current_user.get("email", "")

    # Try to get workspace ID from existing profile
    profile_result = (
        db.table("profiles")
        .select("workspace_id")
        .eq("id", user_id)
        .execute()
    )

    workspace_slug = ""

    if profile_result.data and len(profile_result.data) > 0:
        workspace_id = profile_result.data[0]["workspace_id"]
        # Fetch slug
        ws_data = (
            db.table("workspaces")
            .select("slug")
            .eq("id", workspace_id)
            .execute()
        )
        if ws_data.data:
            workspace_slug = ws_data.data[0].get("slug", "")
    else:
        # Profile doesn't exist yet — create workspace + profile
        import uuid
        logger.info("📦 No profile found for %s — creating workspace + profile", user_id)

        workspace_id = str(uuid.uuid4())
        workspace_slug = f"ws-{user_id[:8]}"

        db.table("workspaces").insert({
            "id": workspace_id,
            "name": data.business_name,
            "slug": workspace_slug,
            "settings": {},
        }).execute()

        db.table("profiles").insert({
            "id": user_id,
            "workspace_id": workspace_id,
            "role": "owner",
            "full_name": user_email.split("@")[0] if user_email else "",
            "permissions": {
                "inbox": True,
                "bookings": True,
                "forms": True,
                "inventory": True,
                "reports": True,
            },
        }).execute()

    # Update workspace with collected info
    db.table("workspaces").update({
        "name": data.business_name,
        "settings": {
            "onboarded": True,
            "address": data.address,
            "timezone": data.timezone,
            "contact_email": data.contact_email,
        },
    }).eq("id", workspace_id).execute()

    # ── Save Services ────────────────────────────────────────────────────
    if data.services:
        for svc in data.services:
            try:
                db.table("services").insert({
                    "workspace_id": workspace_id,
                    "name": svc.get("name", "Unnamed Service"),
                    "description": svc.get("description", ""),
                    "duration_mins": svc.get("duration_mins", 60),
                    "price": svc.get("price", 0),
                    "currency": svc.get("currency", "INR"),
                    "is_active": True,
                }).execute()
            except Exception as exc:
                logger.warning("Failed to create service '%s': %s", svc.get("name"), exc)

    # ── Save Business Hours ──────────────────────────────────────────────
    if data.business_hours:
        for entry in data.business_hours:
            day_name = entry.get("day", "").lower().strip()
            day_num = DAY_MAP.get(day_name)
            if day_num is None:
                logger.warning("Unknown day '%s' — skipping", day_name)
                continue
            try:
                # Upsert: delete existing then insert
                db.table("business_hours").delete().eq(
                    "workspace_id", workspace_id
                ).eq("day_of_week", day_num).execute()

                db.table("business_hours").insert({
                    "workspace_id": workspace_id,
                    "day_of_week": day_num,
                    "is_open": True,
                    "open_time": entry.get("open", "09:00"),
                    "close_time": entry.get("close", "17:00"),
                }).execute()
            except Exception as exc:
                logger.warning("Failed to save hours for %s: %s", day_name, exc)

    logger.info("✅ Onboarding finalized for workspace %s", workspace_id)

    return {
        "status": "success",
        "message": "Workspace is ready!",
        "workspace_slug": workspace_slug,
    }


# ── TTS ──────────────────────────────────────────────────────────────────────


@router.get(
    "/tts",
    summary="Generate speech from text",
    description="Returns an MP3 audio stream for the given text.",
)
async def text_to_speech(
    text: str,
    language_code: str = "en-US",
    settings: AppSettings = None,  # type: ignore[assignment]
) -> StreamingResponse:
    """Convert text to speech and return as an MP3 stream."""
    tts = TTSService(settings)
    audio_content = await tts.synthesize(text=text, language_code=language_code)

    return StreamingResponse(
        io.BytesIO(audio_content),
        media_type="audio/mpeg",
    )


# ── Keep old endpoints for backward compat (deprecated) ─────────────────────


@router.post("/process-step", deprecated=True)
async def process_step_legacy(
    audio: UploadFile = File(...),
    step: str = Form(...),
    language: str = Form(default="en"),
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Legacy step-based processing. Use /chat-voice instead."""
    return {"transcript": "", "extracted_data": {}, "next_question": "Please use the new onboarding.", "confidence": 0}


@router.post("/process-text", deprecated=True)
async def process_text_legacy(
    text: str = Form(...),
    step: str = Form(...),
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Legacy text processing. Use /chat instead."""
    return {"transcript": text, "extracted_data": {}, "next_question": "Please use the new onboarding.", "confidence": 0}
