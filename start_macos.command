#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Double-clickable launcher for macOS/Linux: finds Python 3.9+, installs websockets, runs the bridge.
set -u
cd "$(dirname "$0")" || exit 1

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3.9+ not found. Install it from https://www.python.org/downloads/ and run this again."
  read -r -p "Press Enter to close." _; exit 1
fi
"$PY" -c 'import websockets' 2>/dev/null || "$PY" -m pip install --user websockets || { echo "Could not install websockets."; read -r -p "Press Enter." _; exit 1; }

PORT="${LP_BRIDGE_PORT:-17613}"
old="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n1)"
if [ -n "$old" ]; then echo "Replacing the bridge already running on port $PORT (pid $old)..."; kill "$old" 2>/dev/null; sleep 1; fi

echo "=== LuaPilot Bridge === (keep this window open)"
"$PY" bridge.py
echo; echo "Bridge stopped (exit code $?)."
read -r -p "Press Enter to close." _
