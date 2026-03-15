#!/bin/bash

echo "Starting backend..."

# go to backend folder (safe even if run elsewhere)
cd "$(dirname "$0")"

# activate whichever virtualenv layout exists on this machine
if [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
fi

# --- GPIO MODE ---
# auto = real on Raspberry Pi, mock elsewhere
# real = force Raspberry Pi hardware
# mock = force laptop/CI mock hardware
export GPIO_MODE="${GPIO_MODE:-auto}"

# disable Flask double-run issues (important for GPIO)
export FLASK_DEBUG=0

# tell Flask which file to run
export FLASK_APP=sbBackend.py

# allow network access
export FLASK_RUN_HOST=0.0.0.0
export FLASK_RUN_PORT=5000

# start Flask
flask run
