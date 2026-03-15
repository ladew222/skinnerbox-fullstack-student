#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${SKINNERBOX_LOG_DIR:-${PROJECT_ROOT}/logs}"
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-${LOG_DIR}/backend.log}"
BACKEND_ERROR_LOG_FILE="${BACKEND_ERROR_LOG_FILE:-${LOG_DIR}/backend.error.log}"

mkdir -p "${LOG_DIR}"
touch "${BACKEND_LOG_FILE}" "${BACKEND_ERROR_LOG_FILE}"

# Redirect normal output and errors into stable files so a system service can
# restart safely while still leaving a readable startup history behind.
exec >>"${BACKEND_LOG_FILE}" 2>>"${BACKEND_ERROR_LOG_FILE}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backend launcher"

cd "${SCRIPT_DIR}"

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
else
  echo "No virtual environment found in backend/.venv or backend/venv"
  exit 1
fi

export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"

# Hardware auto-detection keeps laptop runs mocked while allowing real GPIO on
# the Raspberry Pi unless a service explicitly overrides the mode.
export GPIO_MODE="${GPIO_MODE:-auto}"
export OLED_MODE="${OLED_MODE:-auto}"

# Disable Flask debug/reload behavior so GPIO and background threads do not
# start twice when the script is used by systemd.
export FLASK_DEBUG=0
export FLASK_APP="${FLASK_APP:-sbBackend.py}"
export FLASK_RUN_HOST="${FLASK_RUN_HOST:-0.0.0.0}"
export FLASK_RUN_PORT="${FLASK_RUN_PORT:-5000}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend host=${FLASK_RUN_HOST} port=${FLASK_RUN_PORT} gpio=${GPIO_MODE} oled=${OLED_MODE}"

exec flask run --no-debugger --no-reload
