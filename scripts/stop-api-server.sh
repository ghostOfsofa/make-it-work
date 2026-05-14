#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="${PID_FILE:-tmp/api-server.pid}"
PORT="${PORT:-3000}"

if [ ! -f "$PID_FILE" ]; then
  echo "API server PID file not found: $PID_FILE"
else
  PID="$(cat "$PID_FILE")"

  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped API server PID=$PID"
  else
    echo "API server process is not running: PID=$PID"
  fi

  rm -f "$PID_FILE"
fi

PORT_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  echo "$PORT_PIDS" | xargs kill
  echo "Stopped API server listener on port $PORT"
fi
