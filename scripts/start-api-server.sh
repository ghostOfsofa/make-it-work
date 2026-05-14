#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export DB_PATH="${DB_PATH:-data/stocks.db}"
PID_FILE="${PID_FILE:-tmp/api-server.pid}"
LOG_FILE="${LOG_FILE:-tmp/api-server.log}"

if [ ! -d node_modules ]; then
  npm install
fi

mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "API server is already running"
    echo "PID=$EXISTING_PID"
    echo "LOG_FILE=$LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "Starting stock screener API in background"
echo "HOST=$HOST"
echo "PORT=$PORT"
echo "DB_PATH=$DB_PATH"
echo "LOG_FILE=$LOG_FILE"

NODE20_BIN="$(npx -y node@20 -p "process.execPath")"
echo "NODE=$NODE20_BIN"

nohup "$NODE20_BIN" src/apiServer.js >"$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

echo "PID=$PID"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo "Local health check: http://127.0.0.1:$PORT/api/health"
if [ -n "$LAN_IP" ]; then
  echo "LAN health check: http://$LAN_IP:$PORT/api/health"
fi
