#!/bin/bash
set -euo pipefail

echo "🚀 Helix.One Trading Setup (current architecture)"
echo "================================================="

if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo "❌ Run this script from the Helix-One project root"
  exit 1
fi

echo "📦 Installing backend dependencies..."
(cd backend && npm install)

echo "📦 Installing frontend dependencies..."
(cd frontend && npm install)

echo "🔧 Preparing backend env..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from template"
else
  echo "backend/.env already exists (kept as-is)"
fi

echo ""
echo "✅ Next steps"
echo "1) Edit backend/.env and set:"
echo "   - BINANCE_API_KEY"
echo "   - BINANCE_SECRET_KEY"
echo "   - TRADING_ADMIN_KEY (required for protected admin actions)"
echo "2) Keep BINANCE_TESTNET=true until fully validated"
echo "3) Start local services: ./start-local.sh"
echo "4) Open UI: http://127.0.0.1:3010"
echo ""
echo "Current trading API endpoints:"
echo "- GET  /api/trading/status"
echo "- GET  /api/trading/settings"
echo "- POST /api/trading/settings"
echo "- POST /api/trading/toggle"
echo "- POST /api/trading/close-positions"
