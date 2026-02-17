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

# ── Start WhatsApp Bridge with a delay (so FastAPI binds first and old instance shuts down) ──
echo "📱 Scheduling WhatsApp bridge start (15s delay)..."
(sleep 15 && cd whatsapp-bridge && \
  WHATSAPP_BRIDGE_PORT=3001 \
  WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:10000/api/v1/webhooks/whatsapp}" \
  WORKSPACE_ID="${WORKSPACE_ID}" \
  SUPABASE_URL="${SUPABASE_URL}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  node dist/index.js) &
BRIDGE_PID=$!
echo "📱 WhatsApp bridge scheduled (PID: $BRIDGE_PID)"

# ── Start FastAPI backend as main process (exec replaces shell) ──────────────
echo "🔧 Starting FastAPI backend on port $PORT..."
source venv/bin/activate
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --limit-max-requests 1000
