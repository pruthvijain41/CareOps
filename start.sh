#!/usr/bin/env bash
# ============================================================================
# CareOps — Combined Start Script for Render
# Runs both the WhatsApp bridge (Node.js) and FastAPI backend in one service.
# ============================================================================

set -e

echo "🚀 Starting CareOps combined service..."

# ── Build WhatsApp Bridge (compile TS → JS) ──────────────────────────────────
echo "🔨 Building WhatsApp bridge..."
cd whatsapp-bridge
npm run build
cd ..

# ── Start WhatsApp Bridge in background (compiled JS — no ts-node) ───────────
echo "📱 Starting WhatsApp bridge..."
cd whatsapp-bridge
WHATSAPP_BRIDGE_PORT=3001 node dist/index.js &
BRIDGE_PID=$!
echo "📱 WhatsApp bridge started (PID: $BRIDGE_PID)"
cd ..

# ── Start FastAPI backend in foreground ──────────────────────────────────────
echo "🔧 Starting FastAPI backend on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --limit-max-requests 1000
