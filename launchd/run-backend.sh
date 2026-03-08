#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/backend"

mkdir -p "$ROOT_DIR/logs"

if [ ! -f "dist/server.js" ]; then
  npm run build
fi

exec env HOST=127.0.0.1 PORT=3001 npm run start
