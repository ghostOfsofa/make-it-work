#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DAYS="${DAYS:-180}"
INCREMENTAL_DAYS="${INCREMENTAL_DAYS:-10}"
SLEEP_SECONDS="${SLEEP_SECONDS:-0.1}"
MAX_STOCKS="${MAX_STOCKS:-}"

cd "${ROOT_DIR}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python not found: ${PYTHON_BIN}" >&2
  echo "Install Python 3 first, or set PYTHON_BIN=/path/to/python3." >&2
  exit 1
fi

if [ ! -d "${VENV_DIR}" ]; then
  echo "Creating Python virtual environment: ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

# shellcheck source=/dev/null
source "${VENV_DIR}/bin/activate"

echo "Using Python: $(python --version)"
python -m pip install --upgrade pip
python -m pip install finance-datareader

FETCH_ARGS=(
  scripts/fetch-krx-data.py
  --days "${DAYS}"
  --incremental-days "${INCREMENTAL_DAYS}"
  --sleep "${SLEEP_SECONDS}"
)

if [ -n "${MAX_STOCKS}" ]; then
  FETCH_ARGS+=(--max-stocks "${MAX_STOCKS}")
fi

echo "Running: python ${FETCH_ARGS[*]}"
python "${FETCH_ARGS[@]}"

echo "Done. DB path: data/stocks.db"
