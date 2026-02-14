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

# ── Start WhatsApp Bridge with a delay (so FastAPI binds port 10000 first) ───
echo "📱 Scheduling WhatsApp bridge start (5s delay)..."
(sleep 5 && cd whatsapp-bridge && WHATSAPP_BRIDGE_PORT=3001 node dist/index.js) &
BRIDGE_PID=$!
echo "📱 WhatsApp bridge scheduled (PID: $BRIDGE_PID)"

# ── Start FastAPI backend as main process (exec replaces shell) ──────────────
echo "🔧 Starting FastAPI backend on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --limit-max-requests 1000
