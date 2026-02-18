# CareOps — Feature Documentation

Detailed documentation of every major feature in CareOps, including technical implementation notes.

---

## 📅 Smart Booking Engine

A full-featured appointment scheduling system with public booking pages and automated lifecycle management.

### How It Works

1. **Public Booking Page** (`/b/[workspaceSlug]`)
   - Customers visit a branded booking URL
   - Select a service, pick a date, choose from available time slots
   - Submit name, email, and phone number
   - No login required — fully public

2. **State Machine Lifecycle**
   - Every booking flows through a state machine: `pending → confirmed → completed | cancelled | no_show`
   - State transitions trigger automation rules (confirmations, reminders)
   - Staff can manually transition bookings from the dashboard

3. **Google Calendar Sync**
   - Confirmed bookings automatically create Google Calendar events
   - Calendar events include customer details, service name, and duration
   - Cancellations delete the corresponding calendar event

4. **Automated Confirmations**
   - WhatsApp message sent to customer on booking creation
   - Email confirmation via Gmail API with booking details
   - Retry logic (3 attempts) for WhatsApp in case of connection instability

### Technical Details
- **Slot Calculation**: Configurable business hours with `duration_min` per service, 15-minute granularity
- **Conflict Detection**: Checks existing bookings for time overlap before confirming
- **External IDs**: `gcal_event_id` links bookings to Google Calendar, `external_thread_id` links to inbox conversations

---

## 📬 Unified Inbox

All customer communications across WhatsApp, Gmail, and Telegram in a single threaded view.

### Channels

| Channel | Inbound | Outbound | Threading |
|---------|---------|----------|-----------|
| **WhatsApp** | Via Baileys webhook | Via bridge API | Threaded by phone number (`wa_{phone}`) |
| **Gmail** | Via Gmail API sync | Via Gmail API send | Threaded by Gmail thread ID |
| **Telegram** | Via bot webhook | Via bot API | Threaded by chat ID |

### Key Features
- **Threaded Conversations**: Messages grouped into conversation threads by `external_thread_id`
- **AI Reply Suggestions**: Groq-powered smart reply suggestions based on conversation context
- **Read Tracking**: Conversations marked as read when opened, unread count on sidebar
- **Contact Association**: Messages automatically linked to contacts by phone/email
- **Cross-Workspace Routing**: Incoming messages find existing conversations across workspaces, ensuring replies land in the correct thread

### WhatsApp Integration Details
- Custom Node.js bridge using Baileys (unofficial WhatsApp Web API)
- QR code authentication with session persistence (synced to Supabase Storage)
- Automatic reconnection with exponential backoff on connection drops
- Group message filtering — only processes direct messages (1:1)

### Gmail Integration Details
- OAuth2 flow with `gmail.modify` + `gmail.send` scopes
- Inbox sync pulls recent threads and matches to existing conversations
- Outgoing emails logged as staff messages in the inbox
- Reply-to threading preserves Gmail thread IDs

---

## 🤖 Automation Engine

Rule-based automation system that responds to business events with configurable actions.

### Supported Triggers

| Trigger | Fires When |
|---------|------------|
| `new_lead` | A new lead is captured from a form or booking |
| `booking_confirmed` | A booking transitions to confirmed status |
| `booking_completed` | A booking is marked as completed |
| `booking_cancelled` | A booking is cancelled |
| `booking_reminder` | Scheduled reminder before appointment (via scheduler) |
| `inventory_low` | Stock falls below the configured threshold |
| `message_received` | An incoming message is received in the inbox |
| `form_submitted` | A public form submission is received |

### Supported Actions

| Action | Description |
|--------|-------------|
| `send_email` | Send email via connected Gmail account |
| `send_whatsapp` | Send WhatsApp message via bridge |
| `send_form` | Email a form link to the contact |
| `notify_owner` | Create in-app notification |
| `pause_automation` | Stop automation for a conversation (human takeover) |

### Smart Features
- **Template Variables**: `{{contact_name}}`, `{{booking_date}}`, `{{item_name}}`, `{{quantity}}`, etc.
- **Human Takeover Detection**: When staff replies manually, automation pauses for that conversation
- **Delayed Execution**: Actions can be configured with `delay_minutes` for staggered follow-ups
- **Execution Logging**: Every rule execution is logged with trigger payload, action result, and status

### Default Rules (seeded on workspace creation)
1. Welcome New Lead — email the contact with a thank-you message
2. Send Intake Form — email a form link after booking confirmation
3. Booking Reminder — email reminder before the appointment
4. Low Stock Alert — notify when inventory falls below threshold
5. Staff Reply Pause — pause automation when human takes over conversation

---

## 👥 Leads Management

Full lead pipeline from capture to conversion.

### Lead Pipeline

```
New → Contacted → Qualified → Converted
                             ↘ Lost
```

### Lead Sources
- **Public Forms**: Submissions from the public form page
- **Bookings**: Customers who book appointments
- **Manual Entry**: Staff can add leads manually

### Features
- **Status Pipeline**: Track leads through `new → contacted → qualified → converted/lost`
- **Source Tracking**: Know where each lead came from
- **Search & Filter**: Full-text search, filter by status, source, and date
- **Priority Levels**: Mark leads as low/medium/high priority
- **Notes**: Add internal notes to leads
- **Convert to Booking**: One-click conversion from lead to booking
- **Automation Integration**: `new_lead` trigger fires automation rules

---

## 📋 Dynamic Forms

Build custom forms and distribute them to customers.

### Form Builder
- Add/remove fields with drag-and-drop ordering
- Supported field types: `text`, `textarea`, `email`, `phone`, `select`, `checkbox`, `date`, `number`
- Required field validation
- Custom options for select/checkbox fields

### Distribution
- **Public URL**: Each form gets a shareable public link (`/f/[formId]`)
- **Automation**: Forms can be automatically sent via the automation engine after booking confirmation
- **Email**: Form links included in automated email templates

### Submissions
- View all submissions in a tabular format
- Submission data stored as JSONB for flexible schema
- Submission count and analytics on the forms page

---

## 📦 Inventory Tracking

Stock management with low-stock alerts for product-based businesses.

### Features
- **Item Management**: Track items with name, SKU, quantity, unit, and cost
- **Low Stock Alerts**: Configurable threshold per item — triggers automation when breached
- **Supplier Info**: Store supplier name, phone, and email per item
- **Alert History**: Full audit trail of all alerts with timestamps
- **Bulk Operations**: Category-based filtering and search
- **Dashboard Alerts**: Active alerts shown on the main dashboard

---

## 🗣️ AI-Powered Onboarding

Conversational workspace setup powered by Groq (Llama 3).

### Onboarding Flow

1. **Workspace Setup**: Business name, slug, initial configuration
2. **Services**: Define what the business offers (name, duration, price)
3. **Business Hours**: Configure operating hours and days
4. **Gmail Integration**: Connect Gmail for email communications
5. **WhatsApp Integration**: Connect WhatsApp for messaging
6. **Completion**: Workspace ready with default automation rules seeded

### AI Chat Mode
- Free-form conversation — users describe their business naturally
- Groq AI extracts structured data from natural language
- Multi-phase progression: `collecting → services → hours → gmail → whatsapp → done`
- Voice support via Whisper STT + Google Cloud TTS

---

## 👨‍💼 Staff & Permissions

Role-based access control with granular per-module permissions.

### Roles
- **Owner**: Full access to all features and settings
- **Staff**: Access controlled by permissions JSON

### Permission Modules
| Permission Key | Controls Access To |
|----------------|-------------------|
| `bookings` | Booking management |
| `inbox` | Unified inbox |
| `inventory` | Inventory tracking |
| `automation` | Automation rules |
| `forms` | Form builder |
| `staff` | Staff management |
| `leads` | Leads pipeline |

### Features
- Invite staff members with email
- Toggle individual permissions per staff member
- Staff list with role badges and permission indicators
- Owner-only access to workspace settings and integrations

---

## 📊 Analytics Dashboard

Real-time business overview with AI-generated insights.

### Dashboard Components
- **Metrics Cards**: Total revenue, bookings count, new contacts, response rate
- **Pending Actions**: Unread messages, pending bookings, low stock items
- **AI Insights**: Groq-powered analysis of business trends and recommendations
- **Automation Logs**: Recent automation executions with status indicators
- **Inventory Alerts**: Active low-stock warnings
- **Quick Actions**: Direct links to common tasks

---

## 🌐 Public-Facing Pages

Customer-facing pages that don't require authentication.

| Page | Route | Purpose |
|------|-------|---------|
| **Booking** | `/b/[workspaceSlug]` | Service selection, date/time picker, customer details form |
| **Contact Form** | `/c/[workspaceSlug]` | General contact/inquiry form with lead creation |
| **Form Submission** | `/f/[formId]` | Dynamic form rendering with field validation |

### Landing Page
- Premium marketing landing page with:
  - Hero section with CTA
  - Problem statement section
  - Feature grid showcase
  - How-it-works flow
  - Relevance/testimonials
  - Footer with links

---

## 🔐 Google Integration

### Gmail
- OAuth2 authentication with `gmail.modify` + `gmail.send` scopes
- Send emails from the business's Gmail account
- Sync inbox threads for reply tracking
- Per-workspace token storage with refresh handling

### Google Calendar
- OAuth2 authentication with `calendar.events` scope
- Auto-create calendar events for confirmed bookings
- Update/delete events on booking status changes
- Per-workspace calendar integration
