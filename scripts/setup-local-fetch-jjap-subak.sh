#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DAYS="${DAYS:-5}"
INCREMENTAL_DAYS="${INCREMENTAL_DAYS:-2}"
SKIP_EXISTING="${SKIP_EXISTING:-1}"
FORCE_FETCH="${FORCE_FETCH:-0}"
MIN_PRICE_ROWS="${MIN_PRICE_ROWS:-448}"
STALE_DAYS="${STALE_DAYS:-5}"
SLEEP_SECONDS="${SLEEP_SECONDS:-0.1}"
MAX_STOCKS="${MAX_STOCKS:-}"
RUN_SCREEN="${RUN_SCREEN:-1}"
RUN_GENERATE="${RUN_GENERATE:-1}"
PUBLISH_HTML_TO_ROOT="${PUBLISH_HTML_TO_ROOT:-1}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"
SKIP_PIP_INSTALL="${SKIP_PIP_INSTALL:-0}"
ALLOW_FETCH_FAILURE_WITH_EXISTING_DB="${ALLOW_FETCH_FAILURE_WITH_EXISTING_DB:-1}"
NODE_FALLBACK_VERSION="${NODE_FALLBACK_VERSION:-20}"

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
if [ "${SKIP_PIP_INSTALL}" != "1" ]; then
  python -m pip install --upgrade pip
  python -m pip install finance-datareader
fi

FETCH_ARGS=(
  scripts/fetch-krx-data.py
  --days "${DAYS}"
  --incremental-days "${INCREMENTAL_DAYS}"
  --min-price-rows "${MIN_PRICE_ROWS}"
  --stale-days "${STALE_DAYS}"
  --sleep "${SLEEP_SECONDS}"
)

if [ "${SKIP_EXISTING}" = "1" ]; then
  FETCH_ARGS+=(--skip-existing)
else
  FETCH_ARGS+=(--no-skip-existing)
fi

if [ "${FORCE_FETCH}" = "1" ]; then
  FETCH_ARGS+=(--force)
fi

if [ -n "${MAX_STOCKS}" ]; then
  FETCH_ARGS+=(--max-stocks "${MAX_STOCKS}")
fi

echo "Running: python ${FETCH_ARGS[*]}"
set +e
python "${FETCH_ARGS[@]}"
FETCH_EXIT_CODE=$?
set -e

if [ "${FETCH_EXIT_CODE}" -ne 0 ]; then
  if [ "${ALLOW_FETCH_FAILURE_WITH_EXISTING_DB}" = "1" ] && [ -f "${ROOT_DIR}/data/stocks.db" ]; then
    echo "Fetch failed, but existing data/stocks.db was found. Continuing with existing DB." >&2
  else
    echo "Fetch failed and no usable data/stocks.db exists." >&2
    echo "Check network/DNS access to data.krx.co.kr, then rerun this script." >&2
    exit "${FETCH_EXIT_CODE}"
  fi
fi

ensure_node_dependencies() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found. Install Node.js 20/22/24, then rerun this script." >&2
    exit 1
  fi

  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  USE_NODE_FALLBACK=0
  case "${NODE_MAJOR}" in
    20|22|24)
      ;;
    *)
      USE_NODE_FALLBACK=1
      echo "Current Node major version is ${NODE_MAJOR}; using Node ${NODE_FALLBACK_VERSION} via npx for better-sqlite3 compatibility."
      ;;
  esac

  if [ "${SKIP_NPM_INSTALL}" != "1" ] && [ ! -d "${ROOT_DIR}/node_modules" ]; then
    echo "Installing Node dependencies"
    if [ "${USE_NODE_FALLBACK}" = "1" ]; then
      NPM_CLI="$(npm root -g)/npm/bin/npm-cli.js"
      npx -y "node@${NODE_FALLBACK_VERSION}" "${NPM_CLI}" install
    else
      npm install
    fi
  fi
}

run_node_script() {
  local script_path="$1"
  local npm_script="$2"

  ensure_node_dependencies

  if [ "${USE_NODE_FALLBACK}" = "1" ]; then
    echo "Running: npx -y node@${NODE_FALLBACK_VERSION} ${script_path}"
    npx -y "node@${NODE_FALLBACK_VERSION}" "${script_path}"
  else
    echo "Running: npm run ${npm_script}"
    npm run "${npm_script}"
  fi
}

if [ "${RUN_SCREEN}" = "1" ]; then
  run_node_script "src/screenJjapSubak.js" "screen:jjap-subak"
fi

if [ "${RUN_GENERATE}" = "1" ]; then
  run_node_script "src/generate.js" "generate"
fi

if [ "${PUBLISH_HTML_TO_ROOT}" = "1" ]; then
  if [ ! -f "${ROOT_DIR}/dist/index.html" ] || [ ! -f "${ROOT_DIR}/dist/chart.html" ]; then
    echo "dist/index.html or dist/chart.html not found. Run with RUN_GENERATE=1 first." >&2
    exit 1
  fi
  cp "${ROOT_DIR}/dist/index.html" "${ROOT_DIR}/index.html"
  cp "${ROOT_DIR}/dist/chart.html" "${ROOT_DIR}/chart.html"
  rm -rf "${ROOT_DIR}/assets"
  cp -R "${ROOT_DIR}/dist/assets" "${ROOT_DIR}/assets"
  echo "Published static files to repository root: index.html chart.html assets/"
fi

echo "Done. DB path: data/stocks.db"
echo "Done. Screening: JJAP_SUBAK (짭쩡)"
echo "Done. Static files: dist/index.html dist/chart.html dist/assets/"
echo "Upload dist/index.html, dist/chart.html, and dist/assets/ to a static server."
