#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/backend"

mkdir -p "$ROOT_DIR/logs"

if python3 - <<'PY'
import socket
s=socket.socket()
s.settimeout(0.4)
rc=s.connect_ex(('127.0.0.1',3001))
s.close()
raise SystemExit(0 if rc==0 else 1)
PY
then
  echo "[helix-backend] Port 3001 already in use; skipping duplicate launch."
  exit 0
fi

if [ ! -f "dist/server.js" ]; then
  npm run build
fi

exec env HOST=127.0.0.1 PORT=3001 npm run start
