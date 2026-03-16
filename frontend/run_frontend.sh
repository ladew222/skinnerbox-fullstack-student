#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${SKINNERBOX_LOG_DIR:-${PROJECT_ROOT}/logs}"
FRONTEND_LOG_FILE="${FRONTEND_LOG_FILE:-${LOG_DIR}/frontend.log}"
FRONTEND_ERROR_LOG_FILE="${FRONTEND_ERROR_LOG_FILE:-${LOG_DIR}/frontend.error.log}"

mkdir -p "${LOG_DIR}"
touch "${FRONTEND_LOG_FILE}" "${FRONTEND_ERROR_LOG_FILE}"

# Keep boot-time build and runtime output in stable files that are easy to tail
# from the Pi even when the process was started by a system service.
exec >>"${FRONTEND_LOG_FILE}" 2>>"${FRONTEND_ERROR_LOG_FILE}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting frontend launcher"

cd "${SCRIPT_DIR}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to build and serve the frontend."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "frontend/node_modules was not found. Run \`npm install\` before using run_frontend.sh."
  exit 1
fi

export HOST="${HOST:-0.0.0.0}"
export FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-3000}}"
export PORT="${FRONTEND_PORT}"
export BROWSER=none

BACKEND_SCHEME="${BACKEND_SCHEME:-http}"
BACKEND_HOST="${BACKEND_HOST:-localhost}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
BACKEND_TARGET="${BACKEND_SCHEME}://${BACKEND_HOST}:${BACKEND_PORT}"

# By default the production frontend uses relative /api requests, and server.js
# proxies those requests to the configured backend target at runtime. Only set
# REACT_APP_BACKEND_URL when you intentionally want the built bundle to call an
# absolute backend URL directly.
export REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-}"
export FRONTEND_BUILD_ON_START="${FRONTEND_BUILD_ON_START:-1}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Frontend port=${FRONTEND_PORT} proxy_backend=${BACKEND_TARGET} build_api_base=${REACT_APP_BACKEND_URL:-same-origin} build_on_start=${FRONTEND_BUILD_ON_START}"

if [ "${FRONTEND_BUILD_ON_START}" = "1" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building frontend bundle"
  npm run build
elif [ ! -f "build/index.html" ]; then
  echo "Frontend build output is missing and FRONTEND_BUILD_ON_START=0."
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Serving built frontend"
exec node server.js
