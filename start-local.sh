#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] Installing backend dependencies..."
(cd "$ROOT_DIR/backend" && npm install)

echo "[2/4] Preparing backend env..."
if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
fi

echo "[3/4] Installing frontend dependencies..."
(cd "$ROOT_DIR/frontend" && npm install)

echo "[4/4] Starting services..."
(cd "$ROOT_DIR/backend" && npm run dev) &
BACK_PID=$!
(cd "$ROOT_DIR/frontend" && npm run dev -- -p 3010) &
FRONT_PID=$!

echo "Backend PID: $BACK_PID (http://localhost:3001)"
echo "Frontend PID: $FRONT_PID (http://localhost:3010)"
echo "Press Ctrl+C to stop both."

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null || true' INT TERM
wait
