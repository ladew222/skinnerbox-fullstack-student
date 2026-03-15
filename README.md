# SkinnerBox Full-Stack Student

This repository contains the current student-facing SkinnerBox application:

- a React frontend in [frontend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend)
- a Flask backend in [backend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend)
- a GPIO abstraction layer that uses mock hardware on a computer and real GPIO on a Raspberry Pi
- optional I2C OLED status displays for ready/running/error feedback on the box
- token-based authentication with admin approval for network access

This project is documented for native runs only.

The backend is the source of truth for test state. It owns:

- test lifecycle: configure, start, pause, resume, finish
- elapsed-time and timer logic
- lever/nose-poke counts
- reward and stimulus execution
- SQLite persistence

The frontend is a control and monitoring UI. It sends configuration to the backend and polls backend state instead of running the test logic itself.

Authenticated user presets are now stored in SQLite through the backend as well, so saved Trial form values follow the signed-in account instead of only one browser.

## Architecture

At a high level the app looks like this:

```text
React UI
  -> frontend/src/components/TestManager/TestManager.jsx
  -> frontend/src/components/ResultsList/ResultsList.jsx
  -> frontend/src/utilities/api.js

Flask API
  -> backend/sbBackend.py
     -> TestSessionManager: test lifecycle, timer, counters
     -> SQLiteTestRepository: save/update/load results from SQLite
     -> SQLiteAuthRepository: users, bearer tokens, admin approvals
     -> SkinnerHardware: lights, tone, reward pump, pump priming

GPIO Layer
  -> backend/gpio_adapter.py
     -> mock GPIO on a laptop/desktop
     -> real gpiozero hardware on a Raspberry Pi

OLED Layer
  -> backend/display_adapter.py
     -> mock/no-op display on a laptop/desktop
     -> real I2C OLED rendering on a Raspberry Pi
```

## Important Files

```text
backend/
  sbBackend.py           Main Flask app and backend logic
  gpio_adapter.py        Mock-vs-real GPIO selection
  display_adapter.py     Mock-vs-real OLED status display selection
  auth.py                User accounts, login tokens, admin approvals
  reset_admin.py         Local admin create/reset script
  run_backend.sh         Backend launcher with auto GPIO mode
  requirements.txt       Dev/laptop Python dependencies
  requirements.pi.txt    Raspberry Pi Python dependencies
  testdatabase.db        SQLite database used by the backend
  tests/                 Backend tests

frontend/
  src/components/TestManager/TestManager.jsx   Test setup and live run UI
  src/components/ResultsList/ResultsList.jsx   Saved result viewer
  src/utilities/api.js                         Shared API client
  package.json                                React scripts and dependencies
```

## GPIO Modes

The backend uses [gpio_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/gpio_adapter.py).

Supported modes:

- `GPIO_MODE=auto`: real GPIO on a detected Raspberry Pi, mock elsewhere
- `GPIO_MODE=mock`: always use mock hardware
- `GPIO_MODE=real`: always use real GPIO

For most cases:

- on your computer, use `mock` or `auto`
- on the Pi, use `auto` or `real`

## OLED Status Displays

The backend can also mirror basic status text to one or more small I2C OLEDs.

Supported behavior:

- waiting/configured: shows `READY`, the test name, subject, and a prompt to start
- running: shows the test name, time remaining, lever count, and reward count
- paused/finished: shows a basic summary screen
- error: shows a short error message while the error LED is blinking

This uses [display_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/display_adapter.py) and follows the same idea as GPIO:

- `OLED_MODE=auto`: real OLEDs on a detected Raspberry Pi, mock elsewhere
- `OLED_MODE=mock`: never touch real I2C hardware
- `OLED_MODE=real`: always try to use the OLEDs

Useful OLED environment variables:

- `OLED_I2C_ADDRESSES=0x3C` for one display, or `OLED_I2C_ADDRESSES=0x3C,0x3D` to mirror the same status on two displays
- `OLED_DEVICE_TYPE=ssd1306` by default
- `OLED_DEVICE_TYPE=sh1106` if your mini OLEDs use the SH1106 controller instead
- `OLED_WIDTH=128` and `OLED_HEIGHT=64` by default
- `OLED_ROTATE=0` by default

On a computer, leave `OLED_MODE=mock` or `OLED_MODE=auto`.

## Authentication

The app is designed to be reachable on your network, so test control and results pages are protected.

- registration creates a `pending` account in SQLite
- an approved admin must grant access before that user can log in
- login returns a bearer token that the React frontend stores locally and sends on API requests
- protected pages include Trial, Results, Test I/O, Preset Manager, and Admin
- presets are saved per approved user account and are available from both Trial and Preset Manager after sign-in

Admin accounts are managed locally with the backend reset script instead of through the web UI.

### Default Validation Admin

The bundled [backend/testdatabase.db](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/testdatabase.db) now includes a default admin account for local testing and validation:

- email: `admin@example.com`
- password: `AdminPass123`

This is meant for validation only. Reset or replace it before exposing the system on a broader network.

Example:

```bash
cd backend
source .venv/bin/activate
python reset_admin.py --email admin@example.com --name "Local Admin"
```

The script prompts for a password if you do not pass `--password`.

To recreate the same validation admin explicitly:

```bash
cd backend
source .venv/bin/activate
python reset_admin.py --email admin@example.com --name "Validation Admin" --password AdminPass123
```

## Running On A Computer

### Native development

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
GPIO_MODE=mock OLED_MODE=mock FLASK_APP=sbBackend.py flask run --host=0.0.0.0 --port=5000
```

If port `5000` is already in use on your computer, choose another backend port such as `5001`:

```bash
cd backend
source .venv/bin/activate
GPIO_MODE=mock OLED_MODE=mock FLASK_APP=sbBackend.py flask run --host=0.0.0.0 --port=5001
```

Create or reset the local admin account:

```bash
cd backend
source .venv/bin/activate
python reset_admin.py --email admin@example.com --name "Local Admin"
```

If you use the repo's current [backend/testdatabase.db](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/testdatabase.db), you can sign in immediately with the default validation admin:

- email: `admin@example.com`
- password: `AdminPass123`

Frontend:

```bash
cd frontend
npm install
npm start
```

If the backend is not on `5000`, restart the frontend with an explicit backend URL so the ports match:

```bash
cd frontend
REACT_APP_BACKEND_URL=http://localhost:5001 npm start
```

Open:

- frontend: [http://localhost:3000](http://localhost:3000)
- backend: [http://localhost:5000](http://localhost:5000) by default, or your chosen backend port such as [http://localhost:5001](http://localhost:5001)

Notes:

- in native frontend development, `package.json` proxies `/api/*` to `http://localhost:5000`
- if you run the backend on another port, `REACT_APP_BACKEND_URL` must match that port when you start the frontend
- no physical hardware is needed when `GPIO_MODE=mock`
- no physical OLED hardware is needed when `OLED_MODE=mock`

## Running On A Raspberry Pi

### Native Pi run

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.pi.txt
GPIO_MODE=auto OLED_MODE=auto ./run_backend.sh
```

`run_backend.sh` defaults to port `5000`. If you need another backend port on the Pi, override it when you start the backend:

```bash
cd backend
source .venv/bin/activate
FLASK_RUN_PORT=5001 GPIO_MODE=auto OLED_MODE=auto ./run_backend.sh
```

Example Pi run with two mirrored OLEDs:

```bash
cd backend
source .venv/bin/activate
OLED_MODE=auto OLED_I2C_ADDRESSES=0x3C,0x3D OLED_DEVICE_TYPE=ssd1306 GPIO_MODE=auto ./run_backend.sh
```

Create or reset the local admin account on the Pi:

```bash
cd backend
source .venv/bin/activate
python reset_admin.py --email admin@example.com --name "Local Admin"
```

If you copy the bundled [backend/testdatabase.db](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/testdatabase.db) to the Pi, the same validation admin is available there too until you reset it.

Frontend:

```bash
cd frontend
npm install
npm start
```

If the frontend is running on another machine instead of the Pi, set the backend URL explicitly:

```bash
cd frontend
REACT_APP_BACKEND_URL=http://<pi-ip>:5000 npm start
```

If the Pi backend is using a non-default port, include that port in the frontend URL:

```bash
cd frontend
REACT_APP_BACKEND_URL=http://<pi-ip>:5001 npm start
```

## Changing Ports

The default local setup is:

- frontend dev server: `3000`
- backend Flask server: `5000`

If you need different ports, all clients must agree on the backend port.

Backend:

- direct Flask run on a computer: change `--port=5000` to your chosen port
- `run_backend.sh` on the Pi: set `FLASK_RUN_PORT=<port>`

Frontend:

- if the backend stays on `5000`, `npm start` is enough because CRA proxies to `http://localhost:5000`
- if the backend uses another port, start the frontend with `REACT_APP_BACKEND_URL=http://localhost:<port> npm start`
- if the frontend is on another machine, use `REACT_APP_BACKEND_URL=http://<backend-host>:<port> npm start`

Postman:

- import [SkinnerBox.local.postman_environment.json](/Users/egweinberg/Documents/skinnerbox-fullstack-student/postman/SkinnerBox.local.postman_environment.json)
- select the `SkinnerBox Local` environment
- set `baseUrl` to the same backend URL and port, for example `http://localhost:5001` or `http://192.168.1.50:5000`

Examples:

- backend on `5001` locally:

```bash
cd backend
source .venv/bin/activate
GPIO_MODE=mock OLED_MODE=mock FLASK_APP=sbBackend.py flask run --host=0.0.0.0 --port=5001
```

```bash
cd frontend
REACT_APP_BACKEND_URL=http://localhost:5001 npm start
```

- Pi backend on `5001`, frontend on another computer:

```bash
cd backend
source .venv/bin/activate
FLASK_RUN_PORT=5001 GPIO_MODE=auto OLED_MODE=auto ./run_backend.sh
```

```bash
cd frontend
REACT_APP_BACKEND_URL=http://<pi-ip>:5001 npm start
```

## Basic Workflow

### Before a test

1. Make sure an admin account exists locally with `python reset_admin.py --email ...`.
2. For quick validation, sign in with `admin@example.com` / `AdminPass123`.
3. Have users register from the frontend `Register` page.
4. Sign in as an admin and approve those registrations on the `Admin` page.
5. Sign in as an approved user.
6. Open the Test Manager in the frontend.
7. Optionally use the `Prime Water Line` section to run the pump for a chosen number of seconds.
8. Either pick a saved preset to auto-fill the Trial form or enter the test configuration manually.
9. Optionally save the current form as a preset for later reuse.
10. Click `Run Test`.

### During a test

- the backend owns the timer and counts
- the frontend polls `/api/counts` and `/api/test/status`
- lever presses and nose pokes are counted in the backend
- if OLEDs are enabled, the box display shows time remaining and live lever counts during the run

### After a test

- the backend writes counts and status into SQLite
- the frontend Results page loads saved runs from `/api/results`

## Pump Priming

Pump priming is backend-controlled.

- UI entry point: [TestManager.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/TestManager/TestManager.jsx)
- API call: `POST /api/pump/prime`
- backend route: [sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py)

Example:

```bash
curl -X POST http://localhost:5000/api/pump/prime \
  -H "Content-Type: application/json" \
  -d '{"durationSeconds": 1.5}'
```

The backend blocks pump priming while a test is actively running.

## Simulating Inputs Without Hardware

On a computer in mock mode, you can still exercise the test flow.

Simulation endpoints:

- `POST /api/input/lever`
- `POST /api/input/nosepoke`

Examples:

```bash
curl -X POST http://localhost:5000/api/input/lever
curl -X POST http://localhost:5000/api/input/nosepoke
```

These hit the same backend callbacks used by real GPIO inputs.

## Database

The backend stores active and completed test runs in SQLite:

- default database file: [backend/testdatabase.db](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/testdatabase.db)
- optional override for tests or temporary runs: `SKINNERBOX_DB_PATH=/path/to/file.db`
- auth tables in the same SQLite file: `users` and `auth_tokens`

The backend schema is auto-migrated on startup so older database files can still be used.

## How To Validate That The System Is Working

### One-command regression runner

From the repo root:

```bash
python3 scripts/run_regression_suite.py
```

This is the quickest way to validate the project after changes. The script lives at [scripts/run_regression_suite.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/scripts/run_regression_suite.py) and runs the checks in a fixed order:

- backend `unittest` coverage in mock GPIO/OLED mode
- frontend Jest smoke tests
- frontend production build

How it works:

- it runs from the repository root and targets [backend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend) and [frontend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend) automatically
- it uses `backend/.venv/bin/python` for backend tests, so the backend virtual environment must already exist
- it forces `GPIO_MODE=mock` and `OLED_MODE=mock` during backend tests so the suite is safe to run on a laptop without Raspberry Pi hardware attached
- it sets `CI=true` for the frontend Jest run so the test command exits instead of waiting in watch mode
- it stops on the first failing step and returns a non-zero exit code, which makes it useful as a basic regression gate

Prerequisites:

- Python 3
- backend virtual environment and installed backend dependencies
- Node.js and `npm`
- frontend dependencies already installed in [frontend/node_modules](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/node_modules)

Useful options:

- `python3 scripts/run_regression_suite.py --backend-only`
- `python3 scripts/run_regression_suite.py --frontend-only`
- `python3 scripts/run_regression_suite.py --frontend-only --skip-build`

When to use each option:

- use the default command before merging or after broader backend/frontend changes
- use `--backend-only` when you changed Flask routes, database logic, GPIO/OLED behavior, auth, presets, or test lifecycle code
- use `--frontend-only` when you changed React components, routing, API wiring, or MUI presentation logic
- use `--skip-build` when you only want a fast frontend smoke check and do not need the production bundle rebuilt yet

Typical success output ends with:

```text
Regression suite passed.
```

The frontend build may still print warnings from older CRA/ESLint tooling. Warnings do not fail the regression run unless the underlying command exits with an error.

### 1. Backend tests

From [backend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend):

```bash
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest discover -s tests -v
```

This covers:

- authentication, registration approval, and logout
- GPIO mode resolution
- helper GPIO scripts
- OLED ready/running display updates in mock mode
- simulated lever presses
- backend timer completion
- database migration
- pump priming success and safety guard

### 2. Frontend tests

From [frontend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend):

```bash
CI=true npm test -- --watch=false
```

### 3. Frontend production build

From [frontend/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend):

```bash
npm run build
```

### 4. Manual smoke checks

Backend health:

```bash
curl http://localhost:5000/
```

If you changed the backend port, use that port in the health-check URL instead, for example `curl http://localhost:5001/`.

Expected response:

```text
Backend is running!
```

Authentication smoke check:

1. Sign in as `admin@example.com` with password `AdminPass123`.
2. Confirm the `Admin` page loads.
3. Register a new user from the frontend.
4. Sign in as the admin and approve the new user on `/Admin`.
5. Sign in as the approved user and confirm `/Trial`, `/Results`, and `/IoTesting` load.
6. Reset or replace the validation admin password before wider network use.

## Frontend README

If you open [frontend/README.md](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/README.md), treat this root README as the source of truth for project architecture and full-stack run instructions.
