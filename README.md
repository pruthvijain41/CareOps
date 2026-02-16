# CareOps

CareOps is a premium, unified operations platform designed for service-based businesses. It automates complex workflows like booking management, multi-channel customer communication, and inventory monitoring into a single, cohesive dashboard.

## ✨ Key Features

- **Automated Booking Engine**: Intelligent scheduling with Google Calendar integration and state-machine driven status tracking.
- **Multi-Channel Inbox**: Unified communication supporting WhatsApp, Email (Gmail), and SMS.
- **AI-Assisted Operations**: Automated replies, transcription (Whisper), and intelligent inventory alerts.
- **Premium Dashboard**: High-aesthetic UI for managing clients, appointments, and workspace settings.
- **Custom Forms & Onboarding**: Dynamic form builder and multi-step onboarding for new businesses.

## 🛠 Tech Stack

- **Backend**: Python (FastAPI), Pydantic, Uvicorn.
- **Frontend**: Next.js 15, React, Tailwind CSS, Zustand, React Query.
- **Database & Storage**: Supabase (PostgreSQL), Supabase Auth, Row-Level Security.
- **Integrations**: Google Calendar API, Gmail API, WhatsApp (via custom Node.js bridge).

## 🚀 Getting Started

Detailed architecture and technical breakdown can be found in [ARCHITECTURE.md](./ARCHITECTURE.md).

### Prerequisites

- Python 3.10+
- Node.js 18+
- Supabase account and workspace set up.

### Quick Start

1. **Clone and Setup Backend**:
   ```bash
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Setup Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Setup WhatsApp Bridge**:
   ```bash
   cd whatsapp-bridge
   npm install
   npm run build
   node dist/index.js
   ```

## 🏗 Architecture

See the [Architecture Documentation](./ARCHITECTURE.md) for a detailed breakdown of the system design, database schema, and operational flows.

## 📄 License

Proprietary. All rights reserved.
