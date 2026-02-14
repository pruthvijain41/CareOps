#!/usr/bin/env bash
# ============================================================================
# CareOps — Combined Build Script for Render
# Installs both Python (backend) and Node.js (WhatsApp bridge) dependencies.
# ============================================================================

set -e

echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "📦 Installing WhatsApp bridge Node.js dependencies..."
cd whatsapp-bridge
npm install
cd ..

echo "✅ Build complete!"
