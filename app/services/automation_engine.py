"""
CareOps — Automation Engine Service
Executes automation rules based on triggers (new_lead, booking_confirmed, inventory_low, etc.).
"""

import json
import logging
from typing import Any
from uuid import UUID

from app.core.config import Settings

logger = logging.getLogger(__name__)


# ── Default Automation Rules ─────────────────────────────────────────────────

DEFAULT_RULES = [
    {
        "name": "Welcome New Lead",
        "trigger": "new_lead",
        "action": "send_email",
        "config": {
            "subject": "Thanks for reaching out!",
            "body": "Hi {{contact_name}}, thanks for getting in touch. We'll get back to you within 24 hours.",
            "channel": "email",
            "delay_minutes": 0,
        },
        "is_active": True,
    },
    {
        "name": "Booking Confirmation",
        "trigger": "booking_confirmed",
        "action": "send_email",
        "config": {
            "subject": "Your appointment is confirmed",
            "body": "Hi {{contact_name}}, your appointment on {{booking_date}} at {{booking_time}} has been confirmed. We look forward to seeing you!",
            "channel": "email",
            "delay_minutes": 0,
        },
        "is_active": True,
    },
    {
        "name": "Post-Booking Intake Form",
        "trigger": "booking_confirmed",
        "action": "distribute_form",
        "config": {
            "template": "intake_form",
            "message": "Please complete this form before your appointment.",
            "channel": "email",
            "delay_minutes": 10,
        },
        "is_active": True,
    },
    {
        "name": "Booking Reminder",
        "trigger": "booking_reminder",
        "action": "send_email",
        "config": {
            "subject": "Appointment Reminder",
            "body": "Hi {{contact_name}}, this is a reminder about your appointment tomorrow at {{booking_time}}.",
            "channel": "email",
            "delay_minutes": 0,
            "hours_before": 24,
        },
        "is_active": True,
    },
    {
        "name": "Pending Form Reminder",
        "trigger": "form_submitted",
        "action": "send_email",
        "config": {
            "subject": "Reminder: Please complete your form",
            "body": "Hi {{contact_name}}, you haven't completed your intake form yet. Please complete it before your visit: {{form_url}}",
            "channel": "email",
            "delay_minutes": 0,
            "is_reminder": True,
        },
        "is_active": True,
    },
    {
        "name": "Low Stock Alert",
        "trigger": "inventory_low",
        "action": "notify_owner",
        "config": {
            "message": "⚠️ Item '{{item_name}}' is running low ({{quantity}} {{unit}} remaining).",
            "channel": "notification",
            "delay_minutes": 0,
        },
        "is_active": True,
    },
    {
        "name": "Staff Reply Pause",
        "trigger": "message_received",
        "action": "notify_owner",
        "config": {
            "message": "Staff replied to {{contact_name}} — automation paused for this conversation.",
            "channel": "system",
            "delay_minutes": 0,
            "is_system_rule": True,
        },
        "is_active": True,
    },
]


class AutomationEngine:
    """Executes automation rules based on triggers.
    Designed to be called from FastAPI BackgroundTasks."""

    def __init__(self, settings: Settings, supabase_client: Any):
        self.settings = settings
        self.db = supabase_client

    async def seed_default_rules(self, workspace_id: str) -> list[dict]:
        """Create default automation rules for a new workspace."""
        created = []
        for rule in DEFAULT_RULES:
            result = (
                self.db.table("automation_rules")
                .insert({
                    "workspace_id": workspace_id,
                    "name": rule["name"],
                    "trigger": rule["trigger"],
                    "action": rule["action"],
                    "action_config": rule["config"],
                    "is_active": rule["is_active"],
                })
                .execute()
            )
            if result.data:
                created.append(result.data[0])
        logger.info("🤖 Seeded %d default automation rules for workspace %s", len(created), workspace_id)
        return created

    async def fire_trigger(
        self,
        workspace_id: str,
        trigger: str,
        payload: dict[str, Any],
    ) -> list[dict]:
        """
        Find all active rules matching the trigger and execute them.
        Returns list of execution logs.
        """
        # Check if automation is paused for this contact's conversation
        contact_id = payload.get("contact_id")
        if contact_id and await self._is_automation_paused(workspace_id, contact_id):
            logger.info("🤖 Automation paused for contact %s — skipping trigger '%s'", contact_id, trigger)
            return []

        rules = (
            self.db.table("automation_rules")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("trigger", trigger)
            .eq("is_active", True)
            .execute()
        )

        results = []
        # Inject workspace context so actions can look up integrations
        payload["_workspace_id"] = workspace_id
        for rule in rules.data or []:
            # Skip reminder rules unless this IS a reminder
            config = rule.get("action_config", rule.get("config", {}))
            if config.get("is_reminder") and not payload.get("_is_reminder"):
                continue

            try:
                result = await self._execute_rule(rule, payload)
                log = self._log_execution(rule, payload, "success", result)
                results.append(log)
            except Exception as exc:
                logger.error("Automation rule '%s' failed: %s", rule["name"], exc)
                self._log_execution(rule, payload, "error", {"error": str(exc)})

        return results

    async def _execute_rule(self, rule: dict, payload: dict) -> dict:
        """Execute a single automation rule."""
        action = rule["action"]
        config = rule.get("action_config", rule.get("config", {}))

        if action == "send_email":
            return await self._action_send_email(config, payload)
        elif action in ("send_notification", "notify_owner"):
            return await self._action_send_notification(config, payload)
        elif action in ("send_form", "distribute_form"):
            return await self._action_send_form(config, payload)
        elif action == "send_whatsapp":
            return await self._action_send_whatsapp(config, payload)
        elif action == "pause_automation":
            return await self._action_pause_automation(config, payload)
        else:
            logger.warning("Unknown automation action: %s", action)
            return {"status": "skipped", "reason": f"Unknown action: {action}"}

    async def _action_send_email(self, config: dict, payload: dict) -> dict:
        """Send an email using the Gmail API (or log if not connected)."""
        subject = self._render_template(config.get("subject", ""), payload)
        body = self._render_template(config.get("body", ""), payload)
        to_email = payload.get("contact_email", "")
        workspace_id = payload.get("_workspace_id", "")

        if not to_email:
            logger.warning("📧 No contact_email in payload — skipping email")
            return {"status": "skipped", "reason": "no contact_email"}

        if not workspace_id:
            logger.info("📧 Automation email (no workspace context): '%s' → %s", subject, to_email)
            return {"status": "logged", "subject": subject, "to": to_email}

        try:
            from app.services.gmail_service import GmailService
            gmail = GmailService(self.settings, self.db)

            # Build a nice HTML email
            html_body = f"""
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="border: 1px solid #e5e5e5; padding: 24px;">
                    <h2 style="font-family: monospace; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 16px 0; color: #333;">
                        {subject}
                    </h2>
                    <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0;">
                        {body}
                    </p>
                </div>
                <p style="font-family: monospace; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-top: 12px;">
                    Sent by CareOps Automation
                </p>
            </div>
            """

            result = await gmail.send_email(
                workspace_id=workspace_id,
                to=to_email,
                subject=subject,
                body_html=html_body,
            )

            # Record the outgoing email in inbox so it appears as a conversation
            if result.get("status") == "sent":
                try:
                    from app.api.v1.endpoints.communications import (
                        _find_or_create_contact,
                        _upsert_conversation,
                        _insert_message,
                    )
                    contact_name = payload.get("contact_name", to_email.split("@")[0])

                    contact = _find_or_create_contact(
                        db=self.db,
                        workspace_id=workspace_id,
                        email=to_email,
                        full_name=contact_name,
                    )

                    # Use Gmail threadId as thread key so replies link here
                    gmail_thread_id = result.get("thread_id", "")
                    gmail_msg_id = result.get("message_id", "")
                    conversation = _upsert_conversation(
                        db=self.db,
                        workspace_id=workspace_id,
                        contact_id=contact["id"],
                        channel="gmail",
                        external_thread_id=f"gmail_{gmail_thread_id}" if gmail_thread_id else None,
                        subject=subject,
                    )

                    _insert_message(
                        db=self.db,
                        conversation_id=conversation["id"],
                        workspace_id=workspace_id,
                        body=body,
                        source="gmail",
                        sender_type="staff",
                        sender_id=None,
                        external_id=f"gmail_msg_{gmail_msg_id}" if gmail_msg_id else None,
                    )
                    logger.info("📥 Outgoing automation email recorded in inbox for %s", to_email)
                except Exception as rec_exc:
                    logger.warning("Failed to record outgoing email in inbox: %s", rec_exc)

            return result

        except Exception as exc:
            logger.error("📧 Failed to send email: %s", exc)
            return {"status": "error", "error": str(exc)}

    async def _action_send_whatsapp(self, config: dict, payload: dict) -> dict:
        """Send a WhatsApp message via the Baileys bridge."""
        message = self._render_template(config.get("body", config.get("message", "")), payload)
        to_phone = payload.get("contact_phone", "")
        workspace_id = payload.get("_workspace_id", "")

        if not to_phone:
            logger.warning("📱 No contact_phone in payload — skipping WhatsApp")
            return {"status": "skipped", "reason": "no contact_phone"}

        try:
            from app.services.whatsapp_service import WhatsAppService
            wa = WhatsAppService(self.settings)
            
            # Clean phone: use centralized helper
            phone_clean = WhatsAppService.normalize_phone(str(to_phone))
            
            if not phone_clean:
                return {"status": "skipped", "reason": "invalid phone number"}
            
            result = await wa.send_message(chat_id=phone_clean, text=message)
            return result
        except Exception as exc:
            logger.error("📱 Failed to send WhatsApp via bridge: %s", exc)
            return {"status": "error", "error": str(exc)}

    async def _action_send_notification(self, config: dict, payload: dict) -> dict:
        """Send an in-app notification."""
        message = self._render_template(config.get("message", ""), payload)
        logger.info("🔔 Automation notification: %s", message)
        return {"status": "notified", "message": message}

    async def _action_send_form(self, config: dict, payload: dict) -> dict:
        """Send a form link to the contact via email."""
        workspace_id = payload.get("_workspace_id", "")
        to_email = payload.get("contact_email", "")
        contact_name = payload.get("contact_name", "")
        form_message = self._render_template(config.get("message", "Please complete this form."), payload)

        if not to_email or not workspace_id:
            logger.warning("📋 Missing email or workspace for send_form — skipping")
            return {"status": "skipped", "reason": "missing email or workspace"}

        # Find an active form for this workspace (prefer intake forms if available)
        forms = (
            self.db.table("forms")
            .select("id, title")
            .eq("workspace_id", workspace_id)
            .eq("is_active", True)
            .limit(5)
            .execute()
        )

        form = None
        if forms.data:
            # Try to find a form matching the template name
            template = config.get("template", "")
            for f in forms.data:
                if template.lower() in f["title"].lower():
                    form = f
                    break
            # Fallback to first active form
            if not form:
                form = forms.data[0]

        if not form:
            logger.info("📋 No active forms found for workspace %s — skipping", workspace_id)
            return {"status": "skipped", "reason": "no active forms"}

        # Generate public form URL
        form_url = f"{self.settings.FRONTEND_URL}/f/{form['id']}"
        form_title = form.get("title", "Form")

        try:
            from app.services.gmail_service import GmailService
            gmail = GmailService(self.settings, self.db)

            html_body = f"""
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="border: 1px solid #e5e5e5; padding: 24px;">
                    <h2 style="font-family: monospace; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 16px 0; color: #333;">
                        {form_title}
                    </h2>
                    <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0 0 20px 0;">
                        Hi {contact_name}, {form_message}
                    </p>
                    <a href="{form_url}" style="display: inline-block; background: #333; color: #fff; padding: 12px 24px; text-decoration: none; font-family: monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
                        Complete Form →
                    </a>
                </div>
                <p style="font-family: monospace; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-top: 12px;">
                    Sent by CareOps Automation
                </p>
            </div>
            """

            result = await gmail.send_email(
                workspace_id=workspace_id,
                to=to_email,
                subject=f"Please complete: {form_title}",
                body_html=html_body,
            )
            logger.info("📋 Form email sent to %s — form: %s", to_email, form_title)
            return {**result, "form_id": form["id"], "form_title": form_title}

        except Exception as exc:
            logger.error("📋 Failed to send form email: %s", exc)
            return {"status": "error", "error": str(exc)}

    async def _action_pause_automation(self, config: dict, payload: dict) -> dict:
        """Pause automation for a conversation (human takeover)."""
        workspace_id = payload.get("_workspace_id", "")
        conversation_id = payload.get("conversation_id", "")

        if conversation_id and workspace_id:
            try:
                self.db.table("conversations").update(
                    {"automation_paused": True}
                ).eq("id", conversation_id).eq("workspace_id", workspace_id).execute()
                logger.info("⏸️ Automation paused for conversation %s", conversation_id)
                return {"status": "paused", "conversation_id": conversation_id}
            except Exception as exc:
                logger.warning("⏸️ Failed to pause automation: %s", exc)

        return {"status": "logged", "metadata": {"automation_paused": True}}

    def _render_template(self, template: str, payload: dict) -> str:
        """Simple mustache-style template rendering."""
        result = template
        for key, value in payload.items():
            if not key.startswith("_"):
                result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    def _log_execution(
        self,
        rule: dict,
        payload: dict,
        status: str,
        result: dict,
    ) -> dict:
        """Log the automation execution."""
        # Clean payload to remove internal keys
        clean_payload = {k: v for k, v in payload.items() if not k.startswith("_")}

        log_data = {
            "rule_id": rule["id"],
            "workspace_id": rule["workspace_id"],
            "status": status,
            "trigger_payload": clean_payload,
            "action_result": result,
        }

        try:
            self.db.table("automation_logs").insert(log_data).execute()
        except Exception as exc:
            logger.error("Failed to log automation execution: %s", exc)

        return log_data

    async def _is_automation_paused(self, workspace_id: str, contact_id: str) -> bool:
        """Check if automation is paused for a contact's conversation thread."""
        try:
            conv = (
                self.db.table("conversations")
                .select("automation_paused")
                .eq("workspace_id", workspace_id)
                .eq("contact_id", contact_id)
                .eq("automation_paused", True)
                .limit(1)
                .execute()
            )
            return bool(conv.data)
        except Exception:
            return False
