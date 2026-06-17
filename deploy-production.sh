#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[1/6] Backend install/build"
cd "$ROOT/backend"
npm install
[ -f .env ] || cp .env.example .env
npm run build

echo "[2/6] Frontend install/build"
cd "$ROOT/frontend"
npm install
npm run build

echo "[3/6] Stopping dev processes (if running)"
pkill -f "tsx watch src/server.ts" || true
pkill -f "next dev" || true
pkill -f "next-server" || true
pkill -f "next start" || true

echo "[4/6] Starting production services"
if command -v pm2 >/dev/null 2>&1; then
  cd "$ROOT"
  pm2 delete helix-one-backend helix-one-frontend >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs
  pm2 save
  echo "PM2 started apps."
else
  echo "pm2 not installed; starting with nohup fallback"
  cd "$ROOT/backend"
  nohup npm run start:local > "$ROOT/logs/backend.out.log" 2>&1 &
  cd "$ROOT/frontend"
  NEXT_PUBLIC_TRADING_API_URL=http://127.0.0.1:3001/api/trading nohup npm run start:local > "$ROOT/logs/frontend.out.log" 2>&1 &
fi

echo "[5/6] Health checks"
sleep 3
curl -sf http://localhost:3001/health >/dev/null && echo "Backend OK"
curl -sf http://localhost:3010 >/dev/null && echo "Frontend OK"

echo "[6/6] Done"
echo "Frontend: http://localhost:3010"
echo "Backend:  http://localhost:3001"
