#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="${PID_FILE:-tmp/api-server.pid}"
LOG_FILE="${LOG_FILE:-tmp/api-server.log}"

if [ ! -f "$PID_FILE" ]; then
  echo "API server is not running"
  exit 1
fi

PID="$(cat "$PID_FILE")"

if kill -0 "$PID" 2>/dev/null; then
  echo "API server is running"
  echo "PID=$PID"
  echo "LOG_FILE=$LOG_FILE"
else
  echo "API server PID file exists, but process is not running"
  echo "PID=$PID"
  exit 1
fi
