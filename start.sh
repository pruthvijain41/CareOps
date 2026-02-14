#!/usr/bin/env bash
# ============================================================================
# CareOps — Combined Start Script for Render
# Runs both the WhatsApp bridge (Node.js) and FastAPI backend in one service.
# ============================================================================

set -e

echo "🚀 Starting CareOps combined service..."

# ── Start WhatsApp Bridge in background ──────────────────────────────────────
echo "📱 Starting WhatsApp bridge..."
cd whatsapp-bridge
WHATSAPP_BRIDGE_PORT=3001 npx ts-node src/index.ts &
BRIDGE_PID=$!
echo "📱 WhatsApp bridge started (PID: $BRIDGE_PID)"
cd ..

# ── Start FastAPI backend in foreground ──────────────────────────────────────
echo "🔧 Starting FastAPI backend on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
