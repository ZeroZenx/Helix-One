#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

mkdir -p "$ROOT_DIR/logs"

if [ ! -f ".next/BUILD_ID" ]; then
  NEXT_PUBLIC_TRADING_API_URL=http://127.0.0.1:3001/api/trading npm run build
fi

exec env NEXT_PUBLIC_TRADING_API_URL=http://127.0.0.1:3001/api/trading npm run start -- -H 127.0.0.1 -p 3010
