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

looks_like_raspberry_pi() {
  local model_file

  for model_file in /sys/firmware/devicetree/base/model /proc/device-tree/model; do
    if [ -r "${model_file}" ] && tr '[:upper:]' '[:lower:]' < "${model_file}" | grep -q "raspberry pi"; then
      return 0
    fi
  done

  if [ -r /proc/cpuinfo ] && grep -Eqi 'raspberry pi|bcm27|bcm28' /proc/cpuinfo; then
    return 0
  fi

  return 1
}

# On Debian-based Raspberry Pi installs, gpiozero is most reliable when the
# lgpio pin factory is selected explicitly. Keep laptop/mock runs untouched.
if [ "${GPIO_MODE}" != "mock" ] && [ -z "${GPIOZERO_PIN_FACTORY:-}" ] && looks_like_raspberry_pi; then
  export GPIOZERO_PIN_FACTORY=lgpio
fi

# Disable Flask debug/reload behavior so GPIO and background threads do not
# start twice when the script is used by systemd.
export FLASK_DEBUG=0
export FLASK_APP="${FLASK_APP:-sbBackend.py}"
export FLASK_RUN_HOST="${FLASK_RUN_HOST:-0.0.0.0}"
export FLASK_RUN_PORT="${FLASK_RUN_PORT:-5000}"
export BACKEND_SERVER="${BACKEND_SERVER:-gunicorn}"
export GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
export GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"
export GUNICORN_THREADS="${GUNICORN_THREADS:-1}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend host=${FLASK_RUN_HOST} port=${FLASK_RUN_PORT} gpio=${GPIO_MODE} oled=${OLED_MODE} pin_factory=${GPIOZERO_PIN_FACTORY:-default} server=${BACKEND_SERVER}"

if [ "${BACKEND_SERVER}" = "flask" ]; then
  exec flask run --no-debugger --no-reload
fi

if ! command -v gunicorn >/dev/null 2>&1; then
  echo "gunicorn is required for BACKEND_SERVER=${BACKEND_SERVER}. Install backend/requirements.pi.txt or set BACKEND_SERVER=flask."
  exit 1
fi

exec gunicorn \
  --workers "${GUNICORN_WORKERS}" \
  --threads "${GUNICORN_THREADS}" \
  --bind "${FLASK_RUN_HOST}:${FLASK_RUN_PORT}" \
  --timeout "${GUNICORN_TIMEOUT}" \
  --access-logfile - \
  --error-logfile - \
  sbBackend:app
