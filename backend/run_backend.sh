#!/bin/bash

echo "Starting backend..."

# go to backend folder (safe even if run elsewhere)
cd "$(dirname "$0")"

# activate venv
source venv/bin/activate

# --- GPIO MODE ---
# real = Raspberry Pi hardware
# mock = development laptop
export GPIO_MODE=real

# disable Flask double-run issues (important for GPIO)
export FLASK_DEBUG=0

# tell Flask which file to run
export FLASK_APP=sbBackend.py

# allow network access
export FLASK_RUN_HOST=0.0.0.0
export FLASK_RUN_PORT=5000

# start Flask
flask run
