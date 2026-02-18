<div align="center">

# 🏥 CareOps

### Unified Operations Platform for Service Businesses

A full-stack, AI-powered platform that automates scheduling, multi-channel communication, lead management, and inventory tracking — all from a single premium dashboard with an intelligent automation engine.

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Groq](https://img.shields.io/badge/Groq_AI-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com)

[**Live Demo →**](https://frontend-mu-gilt.vercel.app)

</div>

---

## ✨ What Makes This Different

- **Multi-Channel Unified Inbox** — WhatsApp, Gmail, and Telegram threads in one view with AI-suggested replies. Incoming messages are auto-threaded to the correct conversation across workspaces.
- **Intelligent Automation Engine** — Rule-based trigger-action system that fires on business events (new lead, booking confirmed, inventory low) and executes actions (email, WhatsApp, form distribution) with template rendering and human-takeover detection.
- **State Machine Booking Engine** — Bookings flow through `pending → confirmed → completed | cancelled | no_show` with Google Calendar sync, WhatsApp confirmation, and automated reminders.
- **Custom WhatsApp Bridge** — Node.js + Baileys integration with persistent sessions (synced to Supabase), auto-reconnect with exponential backoff, and cross-workspace message routing.
- **AI-Powered Onboarding** — Conversational workspace setup via Groq (Llama 3) — users describe their business naturally, AI extracts structured data across 6 phases.
- **Multi-Tenant Architecture** — Full workspace isolation with Row-Level Security, slug-based routing, and granular staff permissions per module.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 · React 19 · TypeScript · Tailwind CSS · Zustand · React Query |
| **Backend** | FastAPI · Pydantic v2 · Uvicorn · Python 3.12 |
| **AI Engine** | Groq API (Llama 3 / Mixtral) · OpenAI Whisper (STT) · Google Cloud TTS |
| **Database** | Supabase (PostgreSQL) · Row-Level Security · 12+ migration scripts |
| **Integrations** | WhatsApp (Baileys) · Gmail API (OAuth2) · Google Calendar API · Telegram Bot |
| **WhatsApp Bridge** | Node.js · TypeScript · Baileys · Supabase Storage (session persistence) |
| **Auth** | Supabase Auth · JWT · Role-based access with JSONB permissions |
| **Deployment** | Vercel (frontend) · Render (backend + bridge) · CI/CD via Git |

---

## 🏗 Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                  Frontend (Vercel)                    │
│      Next.js 15 + React 19 + TypeScript + Zustand    │
│  Pages: Dashboard · Inbox · Bookings · Leads · Forms │
│         Inventory · Automation · Staff · Settings     │
│  Public: Booking Page · Contact Form · Form Submit    │
└────────────────────┬─────────────────────────────────┘
                     │ REST API (Axios)
┌────────────────────▼─────────────────────────────────┐
│                   Backend (Render)                    │
│              FastAPI + Pydantic v2 + Uvicorn          │
│  Endpoints: bookings · inbox · forms · leads · staff │
│             automation · inventory · dashboard · auth │
│  Services:  automation_engine · booking_state_machine │
│             gmail · whatsapp · calendar · groq_ai     │
│             scheduler · whisper_stt · google_tts      │
└────┬─────────────────┬──────────────────┬────────────┘
     │                 │                  │
┌────▼──────┐   ┌──────▼──────┐   ┌──────▼──────────┐
│ Supabase  │   │ Node.js     │   │ External APIs   │
│ PostgreSQL│   │ WhatsApp    │   │ Gmail · GCal    │
│ Auth      │   │ Bridge      │   │ Groq · Whisper  │
│ Storage   │   │ (Baileys)   │   │ Telegram        │
└───────────┘   └─────────────┘   └─────────────────┘
```

> 📖 **For a deep technical breakdown, see [ARCHITECTURE.md](./ARCHITECTURE.md)**
> 📋 **For detailed feature docs, see [FEATURES.md](./FEATURES.md)**

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ &nbsp;·&nbsp; **Python** 3.12+ &nbsp;·&nbsp; **Supabase** account

### Backend

```bash
git clone https://github.com/pruthvijain41/CareOps.git
cd CareOps

python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env    # Edit with Supabase, Groq, Google Cloud credentials

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # Opens at http://localhost:3000
```

### WhatsApp Bridge (optional)

```bash
cd whatsapp-bridge
npm install && npm run build
node dist/index.js      # Scan QR code to authenticate
```

---

## 📁 Project Structure

```
CareOps/
├── app/                          # Python backend
│   ├── api/v1/endpoints/         # REST API endpoints
│   │   ├── bookings.py           #   Scheduling, calendar sync, public booking
│   │   ├── communications.py     #   Unified inbox, WhatsApp/Gmail webhooks
│   │   ├── forms.py              #   Form builder, public submissions
│   │   ├── inventory.py          #   Stock tracking, alerts, suppliers
│   │   ├── automation.py         #   Rule management, execution logs
│   │   ├── dashboard.py          #   Metrics, actions, AI insights
│   │   ├── staff.py              #   Staff management, permissions
│   │   ├── google_auth.py        #   OAuth2 for Gmail & Calendar
│   │   └── onboarding.py         #   AI-powered workspace setup
│   ├── services/                 # Business logic layer
│   │   ├── automation_engine.py  #   Rule execution engine (5 triggers, 5 actions)
│   │   ├── booking_state_machine.py  # Booking lifecycle management
│   │   ├── gmail_service.py      #   OAuth2 email send/receive/sync
│   │   ├── groq_service.py       #   AI chat, onboarding parsing, reply suggestions
│   │   ├── scheduler.py          #   Background job scheduler (reminders, alerts)
│   │   ├── whatsapp_service.py   #   Bridge API client
│   │   └── whisper_service.py    #   Speech-to-text transcription
│   ├── models/                   # Pydantic schemas & DB models
│   ├── core/                     # Config, dependencies, auth
│   └── main.py                   # FastAPI app factory & lifespan
│
├── frontend/                     # Next.js dashboard
│   ├── app/
│   │   ├── (auth)/               # Login/signup pages
│   │   ├── (dashboard)/          # Protected dashboard routes
│   │   │   └── [workspaceSlug]/  # Multi-tenant workspace pages
│   │   │       ├── page.tsx      #   Dashboard home (metrics + AI insights)
│   │   │       ├── inbox/        #   Unified inbox (WhatsApp + Gmail + Telegram)
│   │   │       ├── bookings/     #   Booking management
│   │   │       ├── leads/        #   Lead pipeline (new → converted)
│   │   │       ├── inventory/    #   Stock management + alerts
│   │   │       ├── forms/        #   Dynamic form builder
│   │   │       ├── automation/   #   Automation rules
│   │   │       ├── staff/        #   Team management + permissions
│   │   │       └── settings/     #   Workspace settings
│   │   └── (public)/             # Public-facing pages (no auth)
│   │       ├── b/                #   Public booking page
│   │       ├── c/                #   Public contact form
│   │       └── f/                #   Public form submissions
│   ├── components/               # Landing page + dashboard components
│   └── stores/                   # Zustand state stores
│
├── whatsapp-bridge/              # Node.js WhatsApp integration
│   └── src/index.ts              # Baileys socket, webhook relay, session sync
│
├── supabase/
│   ├── schema.sql                # Full database schema (12+ tables)
│   └── migrations/               # 11 incremental migrations
│
├── ARCHITECTURE.md               # System design deep-dive
├── FEATURES.md                   # Detailed feature documentation
├── start.sh                      # Production startup (Render)
└── build.sh                      # Production build script
```

---

## 🎯 Core Features

| Feature | Description |
|---|---|
| **📬 Unified Inbox** | Threaded conversations across WhatsApp, Gmail, and Telegram with AI-suggested replies and read tracking |
| **📅 Smart Booking Engine** | Public booking page → state machine lifecycle → Google Calendar sync → automated WhatsApp/Email confirmations |
| **🤖 Automation Engine** | Rule-based triggers (new lead, booking confirmed, inventory low) → automated actions (email, WhatsApp, form distribution) with human-takeover detection |
| **👥 Leads Management** | Capture from forms/bookings → status pipeline (new → contacted → qualified → converted) → one-click convert to booking |
| **📋 Dynamic Forms** | Drag-and-drop form builder with public submission links and automated form distribution |
| **📦 Inventory Tracking** | Stock monitoring with per-item low-stock thresholds, supplier management, and automated reorder alerts |
| **🗣️ AI Onboarding** | Conversational workspace setup via Groq (Llama 3) — 6-phase natural language configuration with voice support |
| **👨‍💼 Staff & Permissions** | Role-based access (owner/staff) with granular per-module permission toggles |
| **📊 Analytics Dashboard** | Real-time metrics, pending actions, AI-generated business insights, and automation logs |
| **💬 WhatsApp Bridge** | Custom Node.js bridge with persistent sessions, auto-reconnect, and cross-workspace message routing |

---

## 📄 License

Proprietary. All rights reserved.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/pruthvijain41">Pruthvi</a></sub>
</div>
