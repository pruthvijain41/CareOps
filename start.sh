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

# ── Start FastAPI backend FIRST (so Render detects port 10000 as primary) ────
echo "🔧 Starting FastAPI backend on port $PORT..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --limit-max-requests 1000 &
BACKEND_PID=$!
echo "🔧 FastAPI backend started (PID: $BACKEND_PID)"

# Wait for FastAPI to bind the port before starting the bridge
sleep 3

# ── Start WhatsApp Bridge in background (compiled JS — no ts-node) ───────────
echo "📱 Starting WhatsApp bridge..."
cd whatsapp-bridge
WHATSAPP_BRIDGE_PORT=3001 node dist/index.js &
BRIDGE_PID=$!
echo "📱 WhatsApp bridge started (PID: $BRIDGE_PID)"
cd ..

# ── Wait for either process to exit ─────────────────────────────────────────
# If FastAPI dies, the whole service should restart
wait $BACKEND_PID
