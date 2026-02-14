"""
CareOps — Groq LLM Service
Wrapper for Groq API (Llama 3 / Mixtral) with retry logic.
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.services.base import BaseExternalService

logger = logging.getLogger(__name__)

GROQ_API_BASE = "https://api.groq.com/openai/v1"


class GroqService(BaseExternalService):
    """Groq LLM integration for AI-powered configuration parsing."""

    service_name = "GroqLLM"

    def __init__(self, settings: Settings | None = None):
        super().__init__(settings)
        self.api_key = self.settings.GROQ_API_KEY
        self.model = self.settings.GROQ_LLM_MODEL

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Send a chat completion request to Groq.

        Args:
            messages: List of {role, content} message dicts.
            temperature: Sampling temperature (lower = more deterministic).
            max_tokens: Maximum response length.
            response_format: Optional {"type": "json_object"} for JSON mode.

        Returns:
            Parsed response dict from the Groq API.
        """

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload: dict[str, Any] = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    payload["response_format"] = response_format

                response = await client.post(
                    f"{GROQ_API_BASE}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                return response.json()

        return await self._execute_with_retry(_call)

    async def parse_onboarding_step(
        self,
        transcript: str,
        step: str,
    ) -> dict[str, Any]:
        """
        Parse a voice transcript for a specific onboarding step.

        Args:
            transcript: Raw text from Whisper STT.
            step: The current step ('workspace', 'services', 'inventory').

        Returns:
            Extracted data + next question.
        """
        prompts = {
            "workspace": (
                "Extract the business name and a brief description of what they do.\n"
                "JSON keys: business_name, description."
            ),
            "services": (
                "Extract a list of services provided. For each service, include name, duration_mins, and price.\n"
                "JSON keys: services: [{name, duration_mins, price}]."
            ),
            "inventory": (
                "Extract a list of supplies or inventory items they track. Include item name and a default low_stock_threshold (suggest 5 if not mentioned).\n"
                "JSON keys: inventory: [{name, low_stock_threshold}]."
            ),
        }

        step_instruction = prompts.get(step, "Extract relevant business configuration.")

        system_prompt = (
            "You are CareOps, an AI assistant helping business owners configure their operations via voice.\n"
            f"{step_instruction}\n\n"
            "Also, generate the 'next_question' to ask the user. \n"
            "If step is 'workspace', next question should be about 'services'.\n"
            "If step is 'services', next question should be about 'inventory supplies'.\n"
            "If step is 'inventory', next question should be 'Ready to review your configuration?'.\n\n"
            "Output VALID JSON with these keys:\n"
            "- extracted_data: { ... }\n"
            "- next_question: string\n"
            "- confidence: float (0-1)"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": transcript},
        ]

        result = await self.chat_completion(
            messages=messages,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        return result

    async def parse_onboarding_chat(
        self,
        messages: list[dict[str, str]],
        collected_so_far: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Drive a free-form conversational onboarding.

        The flow has 6 phases:
          collecting → services → hours → gmail → whatsapp → done

        Args:
            messages: Full conversation history [{role, content}, ...].
            collected_so_far: All fields collected so far, including:
                business_name, address, timezone, contact_email,
                services (list), business_hours (list)

        Returns:
            Raw Groq API response containing JSON with:
                reply, extracted, phase
        """
        current_phase = collected_so_far.get("_phase", "collecting")

        # Basic fields status
        basic_fields = {
            "business_name": collected_so_far.get("business_name"),
            "address": collected_so_far.get("address"),
            "timezone": collected_so_far.get("timezone"),
            "contact_email": collected_so_far.get("contact_email"),
        }
        already = ", ".join(
            f"{k}={v}" for k, v in basic_fields.items() if v
        ) or "nothing yet"
        missing = [k for k, v in basic_fields.items() if not v]
        missing_str = ", ".join(missing) if missing else "none — all collected"

        # Services and hours status
        services_list = collected_so_far.get("services") or []
        hours_list = collected_so_far.get("business_hours") or []

        system_prompt = (
            "You are CareOps, a warm and friendly onboarding assistant for a business operations platform.\n"
            "You guide users through setting up their workspace in a natural conversation.\n\n"
            f"CURRENT PHASE: {current_phase}\n\n"
            "THE PHASES (in order):\n"
            "1. \"collecting\" — Collect 4 basic fields: business_name, address, timezone, contact_email\n"
            "2. \"services\" — Ask about their services (name, duration in minutes, price). They can add multiple.\n"
            "3. \"hours\" — Ask about their business hours (which days they're open, opening/closing times).\n"
            "4. \"gmail\" — Tell them it's time to connect Gmail (the UI will show the button).\n"
            "5. \"whatsapp\" — Tell them they can also connect WhatsApp (the UI will show a QR code).\n"
            "6. \"done\" — Everything is complete, workspace is being set up.\n\n"
        )

        if current_phase == "collecting":
            system_prompt += (
                f"Already collected: {already}\n"
                f"Still missing: {missing_str}\n\n"
                "RULES:\n"
                "- Be conversational, warm, and concise. Use 1-2 sentences max per reply.\n"
                "- Extract any relevant fields from the user's message.\n"
                "- For timezone: if they say a city/country, infer the IANA timezone (e.g. 'Mumbai' → 'Asia/Kolkata').\n"
                "- Once ALL 4 fields are collected, tell them you'd like to know about their services next.\n"
                "  Set phase to \"services\".\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string — your conversational response\n'
                '- "extracted": { "business_name": str|null, "address": str|null, '
                '"timezone": str|null, "contact_email": str|null } — only fields found in THIS message\n'
                '- "phase": "collecting" if still missing fields, "services" if all 4 are collected\n'
            )
        elif current_phase == "services":
            system_prompt += (
                f"Services collected so far: {services_list if services_list else 'none yet'}\n\n"
                "RULES:\n"
                "- Ask the user about the services their business offers.\n"
                "- Extract service details: name, duration_mins (default 60 if not mentioned), price (default 0 if not mentioned).\n"
                "- The user may describe multiple services in one message — extract all of them.\n"
                "- After extracting, ask if they want to add more services.\n"
                "- If the user says 'skip', 'no', 'that's it', 'done', 'no more', 'I'll add later', or similar, "
                "move to the next phase (\"hours\").\n"
                "- Be warm and helpful. Keep responses concise.\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string — your conversational response\n'
                '- "extracted": { "services": [{"name": str, "duration_mins": int, "price": number}] } '
                "— only services found in THIS message, empty array if none\n"
                '- "phase": "services" if still collecting services, "hours" if user is done/skipping\n'
            )
        elif current_phase == "hours":
            system_prompt += (
                f"Business hours collected so far: {hours_list if hours_list else 'none yet'}\n\n"
                "RULES:\n"
                "- Ask the user about their business hours / working days.\n"
                "- Extract: day (Monday, Tuesday, etc.), open time (e.g. '09:00'), close time (e.g. '17:00').\n"
                "- The user may say things like 'Monday to Friday 9am to 6pm' — extract each day separately.\n"
                "- Use 24-hour format for times (e.g. '09:00', '18:00').\n"
                "- After extracting, ask if they have different hours for other days.\n"
                "- If the user says 'skip', 'no', 'that's it', 'done', 'I'll set later', or similar, "
                "move to the next phase (\"gmail\").\n"
                "- Be warm and helpful. Keep responses concise.\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string — your conversational response\n'
                '- "extracted": { "business_hours": [{"day": str, "open": str, "close": str}] } '
                "— only hours found in THIS message, empty array if none\n"
                '- "phase": "hours" if still collecting hours, "gmail" if user is done/skipping\n'
            )
        elif current_phase == "gmail":
            system_prompt += (
                "RULES:\n"
                "- The UI will show Gmail connect instructions and button. You just need to "
                "acknowledge their message.\n"
                "- If the user says they've connected Gmail or clicked the button, be encouraging.\n"
                "- If the user says 'skip' or 'later', move to \"whatsapp\" phase.\n"
                "- Keep it brief.\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string — your conversational response\n'
                '- "extracted": {} — nothing to extract in this phase\n'
                '- "phase": "gmail" if still in gmail step, "whatsapp" if skipping/done\n'
            )
        elif current_phase == "whatsapp":
            system_prompt += (
                "RULES:\n"
                "- The UI will show WhatsApp QR code. You just need to acknowledge.\n"
                "- If the user says they've connected or scanned, be encouraging.\n"
                "- If the user says 'skip' or 'later', move to \"done\" phase.\n"
                "- Keep it brief.\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string — your conversational response\n'
                '- "extracted": {} — nothing to extract in this phase\n'
                '- "phase": "whatsapp" if still in whatsapp step, "done" if skipping/done\n'
            )
        else:
            system_prompt += (
                "The onboarding is complete. Congratulate the user and let them know "
                "their workspace is being set up.\n\n"
                "OUTPUT VALID JSON:\n"
                '- "reply": string\n'
                '- "extracted": {}\n'
                '- "phase": "done"\n'
            )

        full_messages = [{"role": "system", "content": system_prompt}] + messages

        result = await self.chat_completion(
            messages=full_messages,
            temperature=0.4,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )

        return result

    async def health_check(self) -> bool:
        """Verify Groq API connectivity."""
        try:
            await self.chat_completion(
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return True
        except Exception:
            return False
