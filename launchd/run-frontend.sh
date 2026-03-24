#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

mkdir -p "$ROOT_DIR/logs"

if python3 - <<'PY'
import socket
s=socket.socket()
s.settimeout(0.4)
rc=s.connect_ex(('127.0.0.1',3010))
s.close()
raise SystemExit(0 if rc==0 else 1)
PY
then
  echo "[helix-frontend] Port 3010 already in use; skipping duplicate launch."
  exit 0
fi

if [ ! -f ".next/BUILD_ID" ]; then
  NEXT_PUBLIC_TRADING_API_URL=http://127.0.0.1:3001/api/trading npm run build
fi

exec env NEXT_PUBLIC_TRADING_API_URL=http://127.0.0.1:3001/api/trading npm run start
