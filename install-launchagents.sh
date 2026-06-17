#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/Library/LaunchAgents"
mkdir -p "$TARGET" "$ROOT/logs"

for name in com.helixone.backend com.helixone.frontend; do
  src="$ROOT/launchd/$name.plist"
  dst="$TARGET/$name.plist"
  sed "s#__ROOT__#$ROOT#g" "$src" > "$dst"
  launchctl bootout "gui/$(id -u)/$name" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$dst"
  launchctl enable "gui/$(id -u)/$name" >/dev/null 2>&1 || true
  launchctl kickstart -k "gui/$(id -u)/$name"
  echo "Installed $name"
done

echo "LaunchAgents installed and loaded."
