"""
CareOps — Communications API Endpoints
Gmail/Telegram webhooks and unified inbox.
"""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import AppSettings, CurrentUser, SupabaseClient
from app.models.schemas import (
    ConversationResponse,
    GmailWebhookPayload,
    MessageReplySchema,
    MessageResponse,
    TelegramWebhookPayload,
    WhatsAppWebhookPayload,
)
from app.services.gmail_service import GmailService
from app.services.telegram_service import TelegramService
from app.services.whatsapp_service import WhatsAppService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["communications"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _find_or_create_contact(
    db: Any,
    workspace_id: str,
    email: str | None = None,
    phone: str | None = None,
    full_name: str = "Unknown",
) -> dict[str, Any]:
    """Look up a contact by email or phone, or create one if not found."""
    if email:
        result = (
            db.table("contacts")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]

    if phone:
        # Normalize incoming phone
        phone_norm = WhatsAppService.normalize_phone(phone)
        
        # 1. Try exact match on normalized phone
        result = (
            db.table("contacts")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("phone", phone_norm)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
        
        # 2. Try fuzzy match (last 10 digits) if it's a long number
        # This handles cases where DB has '9036101449' and payload has '919036101449'
        if len(phone_norm) >= 10:
            suffix = phone_norm[-10:]
            result = (
                db.table("contacts")
                .select("*")
                .eq("workspace_id", workspace_id)
                .ilike("phone", f"%{suffix}")
                .limit(1)
                .execute()
            )
            if result.data:
                # Enrichment: update contact with the full normalized phone
                db.table("contacts").update({"phone": phone_norm}).eq("id", result.data[0]["id"]).execute()
                return result.data[0]
        
        # Fallback to normalized phone for creation if not found
        phone = phone_norm

    # Create new contact
    new_contact = {
        "workspace_id": workspace_id,
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "tags": ["auto-created"],
        "metadata": {"source": "webhook"},
    }
    insert_result = db.table("contacts").insert(new_contact).execute()
    if not insert_result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create contact from webhook",
        )
    logger.info("👤 Auto-created contact: %s (%s)", full_name, email or phone)
    return insert_result.data[0]


def _upsert_conversation(
    db: Any,
    workspace_id: str,
    contact_id: str,
    channel: str,
    external_thread_id: str | None = None,
    subject: str | None = None,
) -> dict[str, Any]:
    """Find an existing conversation by external thread ID, or create a new one."""
    if external_thread_id:
        result = (
            db.table("conversations")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("external_thread_id", external_thread_id)
            .order("last_message_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            # Update last_message_at
            db.table("conversations").update(
                {"last_message_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", result.data[0]["id"]).execute()
            return result.data[0]

    # Fallback: Find by contact_id + same channel to reuse existing thread
    result = (
        db.table("conversations")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("contact_id", contact_id)
        .eq("channel", channel)
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        conv_found = result.data[0]
        updates = {"last_message_at": datetime.now(timezone.utc).isoformat()}
        if external_thread_id and not conv_found.get("external_thread_id"):
            updates["external_thread_id"] = external_thread_id
        db.table("conversations").update(updates).eq("id", conv_found["id"]).execute()
        return {**conv_found, **updates}

    # Fallback: upgrade an "internal" conversation to a real channel
    if channel != "internal":
        result = (
            db.table("conversations")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("contact_id", contact_id)
            .eq("channel", "internal")
            .order("last_message_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            conv_found = result.data[0]
            updates = {
                "last_message_at": datetime.now(timezone.utc).isoformat(),
                "channel": channel,
            }
            if external_thread_id:
                updates["external_thread_id"] = external_thread_id
            db.table("conversations").update(updates).eq("id", conv_found["id"]).execute()
            return {**conv_found, **updates}

    # Create new conversation
    new_conv = {
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "channel": channel,
        "external_thread_id": external_thread_id,
        "subject": subject or f"New {channel} conversation",
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }
    insert_result = db.table("conversations").insert(new_conv).execute()
    if not insert_result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation",
        )
    return insert_result.data[0]


def _insert_message(
    db: Any,
    conversation_id: str,
    workspace_id: str,
    body: str,
    source: str,
    sender_type: str = "contact",
    sender_id: str | None = None,
    external_id: str | None = None,
) -> dict[str, Any]:
    """Insert a new message into a conversation."""
    message_data = {
        "conversation_id": conversation_id,
        "workspace_id": workspace_id,
        "body": body,
        "source": source,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "external_id": external_id,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    # Mark as unread on new message
    db.table("conversations").update({"is_read": False}).eq("id", conversation_id).execute()
    
    result = db.table("messages").insert(message_data).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to insert message",
        )
    return result.data[0]


# ── Webhooks ─────────────────────────────────────────────────────────────────


@router.post(
    "/webhooks/gmail",
    status_code=status.HTTP_200_OK,
    summary="Gmail push notification webhook",
    description="Receives Gmail Pub/Sub push notifications and creates/updates conversations.",
)
async def gmail_webhook(
    payload: GmailWebhookPayload,
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Process Gmail push notification:
    1. Decode the Pub/Sub message
    2. Match the sender email to a workspace profile
    3. Find or create the contact
    4. Upsert conversation and insert message into DB
    """
    gmail = GmailService(settings)
    notification = await gmail.process_webhook(payload.model_dump())

    if "error" in notification:
        logger.error("Gmail webhook processing failed: %s", notification["error"])
        return {"status": "error", "detail": notification["error"]}

    # Decode notification to get message ID
    history_id: str | None = notification.get("historyId")
    message_id: str | None = None
    
    # In some Gmail push notifications, the message list is included
    if "messages" in notification:
        message_id = notification["messages"][0].get("id")

    logger.info("📬 Gmail webhook — email=%s, historyId=%s, messageId=%s", email_address, history_id, message_id)

    if not email_address:
        return {"status": "ignored", "reason": "no email address in notification"}

    # Match email to a workspace via profiles
    # In production, look up workspace by finding which integration covers this email
    integration = (
        db.table("integrations")
        .select("workspace_id")
        .eq("provider", "gmail")
        .eq("connected_email", email_address)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )

    if not integration.data:
        logger.warning("No active Gmail integration matched for email: %s", email_address)
        return {"status": "ignored", "reason": "no matching workspace integration"}

    workspace_id = integration.data[0]["workspace_id"]

    # Fetch actual message content if we have a message_id
    subject = f"Gmail conversation with {email_address}"
    body = f"New email activity detected (historyId: {history_id})."
    msg_data = {}
    
    if message_id:
        msg_data = await gmail.fetch_message(workspace_id, message_id)
        if "error" not in msg_data:
            subject = msg_data.get("subject", subject)
            body = msg_data.get("body", msg_data.get("snippet", body))

    # Find or create the contact for the sender
    contact = _find_or_create_contact(
        db=db,
        workspace_id=workspace_id,
        email=email_address,
        full_name=email_address.split("@")[0],
    )

    # Upsert conversation (keyed by Gmail threadId if available, else historyId)
    # Note: threadId is better as it stays constant across messages in a thread
    thread_id = msg_data.get("threadId") if msg_data.get("threadId") else history_id
    
    conversation = _upsert_conversation(
        db=db,
        workspace_id=workspace_id,
        contact_id=contact["id"],
        channel="gmail",
        external_thread_id=f"gmail_{thread_id}" if thread_id else None,
        subject=subject,
    )

    # Insert the actual message
    _insert_message(
        db=db,
        conversation_id=conversation["id"],
        workspace_id=workspace_id,
        body=body,
        source="gmail",
        sender_type="contact",
        sender_id=contact["id"],
        external_id=f"gmail_msg_{message_id}" if message_id else f"gmail_hist_{history_id}",
    )

    logger.info(
        "✅ Gmail webhook completed — contact=%s, conversation=%s",
        contact["id"],
        conversation["id"],
    )

    return {
        "status": "processed",
        "contact_id": contact["id"],
        "conversation_id": conversation["id"],
    }


@router.post(
    "/webhooks/telegram",
    status_code=status.HTTP_200_OK,
    summary="Telegram Bot webhook",
    description="Receives Telegram Bot API updates and routes messages to conversations.",
)
async def telegram_webhook(
    payload: TelegramWebhookPayload,
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Process Telegram update:
    1. Extract message/callback data via TelegramService
    2. Find or create contact from the sender's Telegram info
    3. Upsert conversation keyed by chat_id
    4. Insert the message into the DB
    """
    telegram = TelegramService(settings)
    update_data = await telegram.process_update(payload.model_dump())

    if update_data.get("type") == "unknown":
        logger.warning("Unknown Telegram update received")
        return {"status": "ignored", "reason": "unknown update type"}

    chat_id = update_data.get("chat_id")
    from_name = update_data.get("from_name", "Unknown")
    text = update_data.get("text", "")
    message_id = update_data.get("message_id")

    if not chat_id:
        return {"status": "ignored", "reason": "no chat_id"}

    logger.info("💬 Telegram — chat_id=%s, from=%s, text=%s", chat_id, from_name, text[:100])

    # Look up workspace by checking which workspace has Telegram configured
    # In production, store bot-workspace mapping in workspace settings
    workspaces = (
        db.table("workspaces")
        .select("id")
        .limit(1)
        .execute()
    )

    if not workspaces.data:
        logger.warning("No workspace found for Telegram webhook")
        return {"status": "ignored", "reason": "no workspace configured"}

    workspace_id = workspaces.data[0]["id"]

    # Find or create contact (use Telegram chat_id as phone identifier)
    contact = _find_or_create_contact(
        db=db,
        workspace_id=workspace_id,
        phone=f"telegram:{chat_id}",
        full_name=from_name,
    )

    # Upsert conversation (keyed by Telegram chat_id)
    conversation = _upsert_conversation(
        db=db,
        workspace_id=workspace_id,
        contact_id=contact["id"],
        channel="telegram",
        external_thread_id=f"tg_{chat_id}",
        subject=f"Telegram chat with {from_name}",
    )

    # Insert message
    if text:
        _insert_message(
            db=db,
            conversation_id=conversation["id"],
            workspace_id=workspace_id,
            body=text,
            source="telegram",
            sender_type="contact",
            sender_id=contact["id"],
            external_id=f"tg_msg_{message_id}" if message_id else None,
        )

    # Handle callback queries (button clicks)
    if update_data.get("type") == "callback_query":
        callback_data = update_data.get("data", "")
        _insert_message(
            db=db,
            conversation_id=conversation["id"],
            workspace_id=workspace_id,
            body=f"[Callback] {callback_data}",
            source="telegram",
            sender_type="contact",
            sender_id=contact["id"],
            external_id=f"tg_cb_{message_id}" if message_id else None,
        )

    logger.info(
        "✅ Telegram webhook completed — contact=%s, conversation=%s",
        contact["id"],
        conversation["id"],
    )

    return {
        "status": "processed",
        "contact_id": contact["id"],
        "conversation_id": conversation["id"],
    }


@router.post(
    "/webhooks/whatsapp",
    status_code=status.HTTP_200_OK,
    summary="WhatsApp Baileys webhook",
    description="Receives WhatsApp messages from the Baileys bridge.",
)
async def whatsapp_webhook(
    payload: WhatsAppWebhookPayload,
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Process WhatsApp message from Baileys bridge:
    1. Find or create contact from the sender's phone number
    2. Upsert conversation keyed by chat_id
    3. Insert the message into the DB
    """
    import sys
    print(f"🔗 WA-WEBHOOK RECEIVED: {payload.model_dump()}", flush=True)
    workspace_id = str(payload.workspace_id)
    chat_id = payload.chat_id
    from_name = payload.from_name
    text = payload.text
    message_id = payload.message_id

    print(f"📱 WA-WEBHOOK workspace_id={workspace_id}, chat_id={chat_id}, from={from_name}, text={text[:100]}", flush=True)

    # Find or create contact (WhatsApp chat_id is the phone number)
    # Baileys chat_id usually looks like '1234567890@s.whatsapp.net'
    phone_raw = chat_id.split("@")[0]
    phone_clean = WhatsAppService.normalize_phone(phone_raw)
    ext_thread = f"wa_{phone_clean}"
    
    print(f"📱 WA-WEBHOOK phone_raw={phone_raw}, phone_clean={phone_clean}, ext_thread={ext_thread}", flush=True)

    # ── KEY FIX: Look for an existing conversation by external_thread_id ──
    # The bridge may send a different workspace_id than where the booking was created.
    # Find the most recent conversation for this phone in ANY workspace first.
    existing_conv = (
        db.table("conversations")
        .select("*")
        .eq("external_thread_id", ext_thread)
        .eq("channel", "whatsapp")
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )

    if existing_conv.data:
        # Use the workspace_id from the existing conversation
        effective_workspace_id = existing_conv.data[0]["workspace_id"]
        print(f"📱 WA-WEBHOOK FOUND existing conv in workspace={effective_workspace_id} (bridge sent={workspace_id})", flush=True)
        if effective_workspace_id != workspace_id:
            print(f"⚠️  WA-WEBHOOK WORKSPACE MISMATCH: bridge={workspace_id}, existing={effective_workspace_id}. Using existing.", flush=True)
        workspace_id = effective_workspace_id
    else:
        print(f"📱 WA-WEBHOOK No existing conv for {ext_thread}, using bridge workspace_id={workspace_id}", flush=True)

    contact = _find_or_create_contact(
        db=db,
        workspace_id=workspace_id,
        phone=phone_clean,
        full_name=from_name,
    )

    print(f"📱 WA-WEBHOOK contact_id={contact['id']}, contact_name={contact.get('full_name')}", flush=True)

    # Upsert conversation (now using the correct workspace_id)
    conversation = _upsert_conversation(
        db=db,
        workspace_id=workspace_id,
        contact_id=contact["id"],
        channel="whatsapp",
        external_thread_id=ext_thread,
        subject=f"WhatsApp chat with {from_name}",
    )

    print(f"📱 WA-WEBHOOK matched/created conv_id={conversation['id']}, conv_workspace={conversation.get('workspace_id')}", flush=True)

    # Insert message
    _insert_message(
        db=db,
        conversation_id=conversation["id"],
        workspace_id=workspace_id,
        body=text,
        source="whatsapp",
        sender_type="contact",
        sender_id=contact["id"],
        external_id=f"wa_msg_{message_id}" if message_id else None,
    )

    print(f"✅ WA-WEBHOOK DONE contact={contact['id']}, conversation={conversation['id']}", flush=True)

    return {
        "status": "processed",
        "contact_id": contact["id"],
        "conversation_id": conversation["id"],
    }


@router.get(
    "/whatsapp/status",
    summary="Get WhatsApp connection status",
    description="Proxies the status request to the Baileys bridge.",
)
async def get_whatsapp_status(
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Get status from Baileys bridge."""
    wa = WhatsAppService(settings)
    return await wa.get_status()


@router.post(
    "/whatsapp/connect",
    summary="Trigger WhatsApp (re)connection",
    description="Tells the Baileys bridge to clear any stale session and start a fresh connection, generating a new QR code.",
)
async def connect_whatsapp(
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Trigger a fresh WhatsApp connection via the Baileys bridge."""
    import httpx
    bridge_url = settings.WHATSAPP_BRIDGE_URL if hasattr(settings, "WHATSAPP_BRIDGE_URL") else "http://localhost:3001"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{bridge_url}/connect")
            return response.json()
    except Exception as exc:
        logger.error("WhatsApp bridge connect failed: %s", exc)
        return {"success": False, "error": str(exc), "state": "disconnected", "qr": None}

# ── Gmail Sync (Polling) ────────────────────────────────────────────────────


@router.post(
    "/gmail/sync",
    summary="Sync Gmail inbox",
    description="Poll Gmail API for new incoming messages and insert them into conversations.",
)
async def sync_gmail(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Poll Gmail for new messages since last sync:
    1. Get workspace's Gmail integration + stored last_history_id
    2. Call history.list to find new messages
    3. Filter to only incoming (not from connected email)
    4. Insert each new message into the correct conversation
    5. Update last_history_id (stored in credentials JSONB)
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    # Get Gmail integration
    integration = (
        db.table("integrations")
        .select("id, credentials, connected_email")
        .eq("workspace_id", workspace_id)
        .eq("provider", "gmail")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )

    if not integration.data:
        return {"status": "skipped", "reason": "Gmail not connected", "synced": 0}

    integ = integration.data[0]
    creds = integ.get("credentials") or {}
    last_history_id = creds.get("last_history_id")

    gmail = GmailService(settings, db)
    new_messages = await gmail.fetch_new_messages(workspace_id, last_history_id)

    if not new_messages:
        return {"status": "ok", "synced": 0}

    # Extract the new historyId (always present in the last element)
    new_history_id = None
    for msg in new_messages:
        if "_new_history_id" in msg:
            new_history_id = msg["_new_history_id"]

    # Filter out metadata-only entries
    real_messages = [m for m in new_messages if "body" in m and "from_email" in m]

    synced_count = 0
    for msg in real_messages:
        try:
            from_email = msg["from_email"]
            from_name = msg.get("from_name", from_email.split("@")[0])
            subject = msg.get("subject", "Gmail conversation")
            body = msg.get("body", msg.get("snippet", ""))
            thread_id = msg.get("threadId")
            msg_id = msg.get("id")

            # Find or create contact
            contact = _find_or_create_contact(
                db=db,
                workspace_id=workspace_id,
                email=from_email,
                full_name=from_name,
            )

            # Upsert conversation (keyed by Gmail threadId)
            conversation = _upsert_conversation(
                db=db,
                workspace_id=workspace_id,
                contact_id=contact["id"],
                channel="gmail",
                external_thread_id=f"gmail_{thread_id}" if thread_id else None,
                subject=subject,
            )

            # Check for duplicate message
            if msg_id:
                existing = (
                    db.table("messages")
                    .select("id")
                    .eq("external_id", f"gmail_msg_{msg_id}")
                    .limit(1)
                    .execute()
                )
                if existing.data:
                    continue  # Skip duplicate

            # Insert message
            _insert_message(
                db=db,
                conversation_id=conversation["id"],
                workspace_id=workspace_id,
                body=body,
                source="gmail",
                sender_type="contact",
                sender_id=contact["id"],
                external_id=f"gmail_msg_{msg_id}" if msg_id else None,
            )
            synced_count += 1
            logger.info("📬 Gmail sync: new message from %s in conversation %s", from_email, conversation["id"])
        except Exception as exc:
            logger.warning("Gmail sync: failed to process message: %s", exc)

    # Update last_history_id in credentials JSONB
    if new_history_id:
        updated_creds = {**creds, "last_history_id": new_history_id}
        try:
            db.table("integrations").update({"credentials": updated_creds}).eq("id", integ["id"]).execute()
        except Exception as exc:
            logger.warning("Failed to update Gmail history_id: %s", exc)

    return {"status": "ok", "synced": synced_count, "history_id": new_history_id}


# ── Inbox ────────────────────────────────────────────────────────────────────



@router.get(
    "/inbox/{thread_id}",
    response_model=ConversationResponse,
    summary="Get conversation thread",
    description="Fetch a conversation with all its messages, ordered by sent time.",
)
async def get_inbox_thread(
    thread_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> ConversationResponse:
    """
    Fetch a full conversation thread:
    1. Get conversation by ID (scoped to user's workspace)
    2. Fetch all messages in the conversation
    3. Return combined response
    """
    user_id = current_user.get("id")

    # Get the user's workspace
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    # Fetch conversation
    conv_result = (
        db.table("conversations")
        .select("*")
        .eq("id", str(thread_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )

    if not conv_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {thread_id} not found",
        )

    # Fetch messages
    messages_result = (
        db.table("messages")
        .select("*")
        .eq("conversation_id", str(thread_id))
        .order("sent_at", desc=False)
        .execute()
    )

    messages = [MessageResponse(**msg) for msg in (messages_result.data or [])]

    # Mark conversation as read when opened
    if not conv_result.data.get("is_read", False):
        db.table("conversations").update({"is_read": True}).eq("id", str(thread_id)).execute()
        conv_result.data["is_read"] = True

    return ConversationResponse(
        **conv_result.data,
        messages=messages,
    )


@router.get(
    "/inbox",
    response_model=list[ConversationResponse],
    summary="List inbox conversations",
    description="Fetch all conversation threads for the workspace, ordered by recency.",
)
async def list_inbox(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[ConversationResponse]:
    """
    List all conversations in the workspace:
    1. Fetch conversations ordered by last_message_at
    2. Return list
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found",
        )
    workspace_id = profile.data["workspace_id"]

    result = (
        db.table("conversations")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("last_message_at", desc=True)
        .execute()
    )

    return [ConversationResponse(**conv) for conv in (result.data or [])]


@router.get(
    "/contacts",
    response_model=list[dict[str, Any]],
    summary="List or search contacts",
    description="Fetch contacts for the workspace, optionally filtered by name.",
)
async def list_contacts(
    query: str | None = None,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List or search contacts in the workspace."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()

    if not profile.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    workspace_id = profile.data["workspace_id"]

    req = db.table("contacts").select("*").eq("workspace_id", workspace_id)
    if query:
        req = req.ilike("full_name", f"%{query}%")
    
    result = req.limit(50).order("full_name").execute()
    return result.data or []


@router.post(
    "/inbox/{thread_id}/suggest-reply",
    summary="Get AI-suggested replies",
    description="Generate smart reply suggestions based on conversation context.",
)
async def suggest_reply(
    thread_id: UUID,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """
    Generate AI reply suggestions for a conversation:
    1. Fetch conversation + last messages
    2. Get contact name and workspace name for personalization
    3. Send to Groq for suggestion generation
    4. Return 2 suggested replies + detected intent
    """
    from app.services.groq_service import GroqService
    import json

    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    # Fetch conversation
    conv = (
        db.table("conversations")
        .select("*, contacts(full_name, email)")
        .eq("id", str(thread_id))
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    contact_name = conv.data.get("contacts", {}).get("full_name", "Customer") if conv.data.get("contacts") else "Customer"
    contact_id = conv.data.get("contact_id")

    # Fetch workspace name
    ws = db.table("workspaces").select("name").eq("id", workspace_id).single().execute()
    workspace_name = ws.data["name"] if ws.data else "our team"

    # Fetch services (compact: name, duration, price only)
    services_result = (
        db.table("services")
        .select("name, duration_mins, price")
        .eq("workspace_id", workspace_id)
        .eq("is_active", True)
        .limit(20)
        .execute()
    )
    services_list = services_result.data or []

    # Check if contact has any upcoming bookings (compact check)
    contact_bookings = []
    if contact_id:
        bookings_result = (
            db.table("bookings")
            .select("starts_at, status, services(name)")
            .eq("workspace_id", workspace_id)
            .eq("contact_id", str(contact_id))
            .in_("status", ["pending", "confirmed"])
            .order("starts_at")
            .limit(3)
            .execute()
        )
        contact_bookings = bookings_result.data or []

    # Fetch ALL workspace bookings for next 7 days (for slot conflict detection)
    from datetime import timedelta
    now_utc = datetime.now(timezone.utc)
    week_ahead = now_utc + timedelta(days=7)
    all_bookings_result = (
        db.table("bookings")
        .select("starts_at, ends_at, status")
        .eq("workspace_id", workspace_id)
        .in_("status", ["pending", "confirmed"])
        .gte("starts_at", now_utc.isoformat())
        .lte("starts_at", week_ahead.isoformat())
        .order("starts_at")
        .limit(50)
        .execute()
    )
    all_booked_slots = all_bookings_result.data or []

    # Fetch last 10 messages
    messages_result = (
        db.table("messages")
        .select("body, sender_type, sent_at")
        .eq("conversation_id", str(thread_id))
        .order("sent_at", desc=True)
        .limit(10)
        .execute()
    )
    messages = list(reversed(messages_result.data or []))

    if not messages:
        return {"suggestions": [], "detected_intent": "none"}

    # Check if last message is from contact (only suggest when customer sent last)
    if messages[-1].get("sender_type") != "contact":
        return {"suggestions": [], "detected_intent": "none"}

    # Build conversation context for AI
    conv_history = "\n".join(
        f"{'Customer' if m['sender_type'] == 'contact' else 'Staff'}: {m['body']}"
        for m in messages
    )

    # Build compact workspace context
    workspace_context = f"Business: {workspace_name}\n"
    if services_list:
        svc_lines = ", ".join(
            f"{s['name']} ({s.get('duration_mins', '?')}min, ${s.get('price', '?')})"
            for s in services_list
        )
        workspace_context += f"Services offered: {svc_lines}\n"
    if contact_bookings:
        booking_lines = "; ".join(
            f"{b.get('services', {}).get('name', 'Appointment')} on {b['starts_at'][:10]} ({b['status']})"
            for b in contact_bookings
        )
        workspace_context += f"{contact_name}'s upcoming bookings: {booking_lines}\n"
    else:
        workspace_context += f"{contact_name} has no upcoming bookings.\n"

    # Add booked slots for scheduling conflict awareness
    if all_booked_slots:
        # Group by date for compact representation
        from collections import defaultdict
        slots_by_date: dict[str, list[str]] = defaultdict(list)
        for slot in all_booked_slots:
            date_str = slot["starts_at"][:10]
            start_time = slot["starts_at"][11:16]
            end_time = slot["ends_at"][11:16] if slot.get("ends_at") else "?"
            slots_by_date[date_str].append(f"{start_time}-{end_time}")
        booked_str = "; ".join(f"{d}: {', '.join(times)}" for d, times in slots_by_date.items())
        workspace_context += f"Already booked time slots (next 7 days): {booked_str}\n"

    system_prompt = (
        f"You are a helpful reply assistant for {workspace_name}.\n"
        f"The customer's name is {contact_name}.\n\n"
        f"WORKSPACE CONTEXT:\n{workspace_context}\n"
        "Analyze the conversation and generate exactly 2 short, professional reply suggestions.\n\n"
        "RULES:\n"
        "- Each reply should be 1-3 sentences, warm and professional\n"
        "- Address the customer by first name\n"
        "- Use your knowledge of the workspace's services and prices when relevant\n"
        "- If customer asks about services, mention actual service names and prices from the context\n"
        "- For RESCHEDULING: reference their actual booking if available, ask for preferred new time\n"
        "- If customer requests a specific time that overlaps with an already booked slot, let them know that time is unavailable and suggest nearby open times from the schedule\n"
        "- For CANCELLATION: acknowledge politely, reference their booking details\n"
        "- For SERVICE INQUIRIES: mention real services, durations, and prices\n"
        "- For COMPLAINTS: empathize first, then offer a solution\n"
        "- Do NOT use markdown formatting (no ** or * or #)\n"
        "- Do NOT include email signatures or formal closings\n"
        "- Keep the tone conversational but professional\n\n"
        "Detect the customer's intent. Choose one: reschedule, cancel, inquiry, complaint, follow_up, greeting, other\n\n"
        "OUTPUT VALID JSON:\n"
        '{"suggestions": ["reply 1", "reply 2"], "detected_intent": "intent_type"}\n'
    )



    try:
        groq = GroqService(settings)
        result = await groq.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Conversation:\n{conv_history}"},
            ],
            temperature=0.7,
            max_tokens=512,
            response_format={"type": "json_object"},
        )

        content = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = json.loads(content)

        suggestions = parsed.get("suggestions", [])[:2]
        detected_intent = parsed.get("detected_intent", "other")

        return {"suggestions": suggestions, "detected_intent": detected_intent}

    except Exception as e:
        logger.warning("AI suggestion generation failed: %s", e)
        return {"suggestions": [], "detected_intent": "error"}


@router.post(
    "/inbox/{thread_id}/reply",
    response_model=MessageResponse,
    summary="Reply to a conversation",
    description="Send a message from staff and pause auto-reply automations for this thread.",
)
async def reply_to_thread(
    thread_id: UUID,
    data: MessageReplySchema,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
    settings: AppSettings = None,  # type: ignore[assignment]
) -> MessageResponse:
    """
    Reply to a thread:
    1. Validate conversation and workspace
    2. Insert message as 'staff'
    3. Send real email via Gmail API to the contact
    4. Update conversation last_message_at
    """
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    workspace_id = profile.data["workspace_id"]

    # Verify conversation
    conv = db.table("conversations").select("*").eq("id", str(thread_id)).eq("workspace_id", workspace_id).single().execute()
    if not conv.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Insert message into DB
    message = _insert_message(
        db=db,
        conversation_id=str(thread_id),
        workspace_id=workspace_id,
        body=data.body,
        source="internal",
        sender_type="staff",
        sender_id=user_id,
    )

    # Update conversation timestamp
    db.table("conversations").update({
        "last_message_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", str(thread_id)).execute()

    # ── Send real email via Gmail API ────────────────────────────────────
    contact_id = conv.data.get("contact_id")
    if contact_id:
        try:
            contact = (
                db.table("contacts")
                .select("email, full_name, phone")
                .eq("id", contact_id)
                .single()
                .execute()
            )
            contact_email = contact.data.get("email") if contact.data else None
            contact_name = contact.data.get("full_name", "there") if contact.data else "there"
            contact_phone = contact.data.get("phone") if contact.data else None

            logger.info("ℹ️ Replying to contact: %s (ID: %s, Phone: %s)", contact_name, contact_id, contact_phone)

            if contact_email:
                gmail = GmailService(settings, db)
                subject = conv.data.get("subject", "Reply from our team")
                html_body = f"""
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <div style="border: 1px solid #e5e5e5; padding: 24px;">
                        <p style="font-size: 14px; line-height: 1.6; color: #333; margin: 0 0 16px 0;">
                            Hi {contact_name},
                        </p>
                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0; white-space: pre-wrap;">
                            {data.body}
                        </p>
                    </div>
                    <p style="font-family: monospace; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-top: 12px;">
                        Sent via CareOps
                    </p>
                </div>
                """
                result = await gmail.send_email(
                    workspace_id=workspace_id,
                    to=contact_email,
                    subject=f"Re: {conv.data.get('subject', 'Reply')}",
                    body_html=html_body,
                )
                logger.info("📧 Email sent via Gmail API: %s", result.get("id"))
            else:
                logger.info("📧 No email for contact %s — reply saved in DB only", contact_id)
        except Exception as exc:
            logger.warning("📧 Failed to send reply email (saved in DB): %s", exc)
            # Ensure contact details are still available for WhatsApp logic even if Gmail fails
            contact_phone = None
            try:
                contact_phone_result = db.table("contacts").select("phone").eq("id", contact_id).single().execute()
                contact_phone = contact_phone_result.data.get("phone") if contact_phone_result.data else None
                # Re-fetch full contact data if needed for other parts, or just ensure 'contact' is defined
                contact = contact_phone_result.data # Update contact with at least phone
            except Exception:
                pass # If even fetching phone fails, contact_phone remains None
    else:
        contact_phone = None # Explicitly set to None if no contact_id

    # ── Send real WhatsApp via Baileys bridge ──────────────────────────
    is_whatsapp_conv = conv.data.get("channel") == "whatsapp"
    # Use the potentially updated 'contact' variable or 'contact_phone' directly
    is_internal_with_phone = conv.data.get("channel") == "internal" and contact_phone
    
    if is_whatsapp_conv or is_internal_with_phone:
        external_thread_id = conv.data.get("external_thread_id")
        wa_chat_id = None
        
        # Determine the WhatsApp ID (JID)
        if external_thread_id and external_thread_id.startswith("wa_"):
            wa_chat_id = external_thread_id.replace("wa_", "")
        elif is_internal_with_phone:
            # Use normalize_phone helper on the stabilized contact_phone
            wa_chat_id = WhatsAppService.normalize_phone(contact_phone)
            
        if wa_chat_id:
            wa = WhatsAppService(settings)
            result = await wa.send_message(chat_id=wa_chat_id, text=data.body)
            if result.get("success"):
                logger.info("📱 WhatsApp message sent via bridge to %s", wa_chat_id)
                
                # Upgrade internal thread to WhatsApp thread if it was internal
                if conv.data.get("channel") == "internal":
                    try:
                        db.table("conversations").update({
                            "channel": "whatsapp",
                            "external_thread_id": f"wa_{wa_chat_id}",
                            "subject": f"WhatsApp chat with {contact_name}"
                        }).eq("id", str(thread_id)).execute()
                        logger.info("✅ Upgraded internal thread %s to WhatsApp channel", thread_id)
                    except Exception as e:
                        logger.warning("⚠️ Failed to upgrade thread to WhatsApp channel: %s", e)
            else:
                logger.error("❌ Failed to send WhatsApp message to %s: %s", wa_chat_id, result.get("error"))
        else:
            logger.warning("📱 WhatsApp reply skipped — no valid phone/JID found for thread %s", thread_id)

    # ── Pause automation for this conversation (human takeover) ─────────
    try:
        db.table("conversations").update({
            "automation_paused": True,
        }).eq("id", str(thread_id)).execute()
        logger.info("⏸️ Staff replied to thread %s — automation paused for this conversation", thread_id)
    except Exception as exc:
        # automation_paused column may not exist yet — non-blocking
        logger.warning("⏸️ Could not set automation_paused (column may not exist): %s", exc)

    return MessageResponse(**message)


# ── Leads ────────────────────────────────────────────────────────────────────

VALID_LEAD_STATUSES = [
    "new", "contacted", "in_progress", "qualified",
    "booking_sent", "converted", "lost",
]

VALID_LEAD_SOURCES = [
    "contact_form", "gmail", "telegram", "whatsapp", "manual", "unknown",
]


@router.get(
    "/leads",
    summary="List leads",
    description="Fetch all leads (contacts with lead pipeline data), with optional filters.",
)
async def list_leads(
    status: str | None = None,
    source: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> list[dict[str, Any]]:
    """List leads with optional filters."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    req = (
        db.table("contacts")
        .select("*, conversations(id, last_message_at, channel), bookings(id, status, starts_at)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
    )

    if status:
        req = req.eq("lead_status", status)
    if source:
        req = req.eq("lead_source", source)
    if search:
        req = req.or_(f"full_name.ilike.%{search}%,email.ilike.%{search}%,phone.ilike.%{search}%")
    if date_from:
        req = req.gte("created_at", date_from)
    if date_to:
        req = req.lte("created_at", date_to)

    result = req.limit(200).execute()
    return result.data or []


@router.post(
    "/leads",
    status_code=status.HTTP_201_CREATED,
    summary="Create a lead manually",
    description="Manually add a new lead (contact) with lead pipeline data.",
)
async def create_lead(
    data: dict[str, Any],
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Manually create a new lead."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    full_name = data.get("full_name", "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Name is required")

    lead_record = {
        "workspace_id": workspace_id,
        "full_name": full_name,
        "email": data.get("email", "").strip() or None,
        "phone": data.get("phone", "").strip() or None,
        "lead_status": "new",
        "lead_source": data.get("lead_source", "manual"),
        "lead_notes": data.get("lead_notes", "").strip() or None,
    }

    result = db.table("contacts").insert(lead_record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create lead")

    return result.data[0]


@router.patch(
    "/leads/{lead_id}/status",
    summary="Update lead status",
    description="Change the pipeline status of a lead.",
)
async def update_lead_status(
    lead_id: UUID,
    data: dict[str, Any],
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Update a lead's pipeline status."""
    new_status = data.get("status", "")
    if new_status not in VALID_LEAD_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(VALID_LEAD_STATUSES)}",
        )

    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    update_payload: dict[str, Any] = {"lead_status": new_status}
    # If marking as contacted or beyond, set last_contacted_at
    if new_status in ("contacted", "in_progress", "qualified", "booking_sent"):
        update_payload["last_contacted_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        db.table("contacts")
        .update(update_payload)
        .eq("id", str(lead_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]


@router.patch(
    "/leads/{lead_id}/notes",
    summary="Update lead notes",
    description="Add or update notes on a lead.",
)
async def update_lead_notes(
    lead_id: UUID,
    data: dict[str, Any],
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Update a lead's notes."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    result = (
        db.table("contacts")
        .update({"lead_notes": data.get("notes", "")})
        .eq("id", str(lead_id))
        .eq("workspace_id", workspace_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]


@router.get(
    "/leads/metrics",
    summary="Lead pipeline metrics",
    description="Get lead funnel summary: totals by status and conversion rate.",
)
async def get_lead_metrics(
    current_user: CurrentUser = None,  # type: ignore[assignment]
    db: SupabaseClient = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Get lead pipeline metrics."""
    user_id = current_user.get("id")
    profile = db.table("profiles").select("workspace_id").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=403, detail="Profile not found")
    workspace_id = profile.data["workspace_id"]

    all_contacts = (
        db.table("contacts")
        .select("lead_status")
        .eq("workspace_id", workspace_id)
        .execute()
    )

    leads = all_contacts.data or []
    total = len(leads)

    counts: dict[str, int] = {}
    for lead in leads:
        s = lead.get("lead_status", "new")
        counts[s] = counts.get(s, 0) + 1

    converted = counts.get("converted", 0)
    conversion_rate = round((converted / total * 100), 1) if total > 0 else 0.0

    return {
        "total": total,
        "new": counts.get("new", 0),
        "contacted": counts.get("contacted", 0),
        "in_progress": counts.get("in_progress", 0),
        "qualified": counts.get("qualified", 0),
        "booking_sent": counts.get("booking_sent", 0),
        "converted": converted,
        "lost": counts.get("lost", 0),
        "conversion_rate": conversion_rate,
    }
