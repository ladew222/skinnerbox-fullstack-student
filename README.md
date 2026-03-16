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

## User Manual

If you want the operator-facing guide for using the app, start with [docs/user-manual.md](/Users/egweinberg/Documents/skinnerbox-fullstack-student/docs/user-manual.md).

That guide focuses on:

- signing in
- using I/O Config
- running a trial
- using presets
- reviewing results and charts
- using the Admin page
- troubleshooting common user problems

If you are maintaining the screenshots or refreshing the manual assets, use [docs/manual-maintenance.md](/Users/egweinberg/Documents/skinnerbox-fullstack-student/docs/manual-maintenance.md) instead.

## Developer Guide

### Mental model

When you are changing this codebase, the most important rule is:

- the backend owns test truth
- the frontend renders backend state and sends user intent

That means timer logic, counters, start/stop/finish state, persistence, hardware actions, and authenticated access checks belong in the backend. The React app should not invent its own version of those values.

### Typical request flow

For most product changes, the path through the system looks like this:

```text
Browser route
  -> App.js
  -> ProtectedRoute/AuthContext
  -> page component (Trial, Results, Admin, IoTesting)
  -> feature component (TestManager, ResultsList, AdminPanel, PresetManager)
  -> frontend/src/utilities/api.js
  -> Flask route in backend/sbBackend.py
  -> service/repository/hardware classes
  -> SQLite and optional GPIO/OLED hardware
```

In beginner terms, a user clicks something in the browser, React decides which screen to show, that screen calls the shared API helper, and the API helper sends a request to Flask. Flask then decides whether the request is allowed, updates test state or the database, possibly triggers hardware, and sends a JSON response back to the frontend so the page can refresh what the user sees.

For example, when someone clicks `Run Test`, the frontend does not start a timer by itself. It sends the chosen settings to the backend, the backend starts the session, owns the countdown and counters, and the frontend keeps polling for updated status so it can display the current state.

### Frontend structure

The frontend entry point is [frontend/src/components/App/App.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/App/App.js). It sets up routes and wraps protected areas of the UI.

Main frontend modules:

- [frontend/src/context/AuthContext.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/context/AuthContext.jsx): This is the frontend's shared "who is signed in right now?" helper. It remembers the current user and token, restores them when the page reloads, and gives the rest of the app simple helpers like login, logout, and current-user checks. In plain terms, this is how pages avoid each one separately tracking authentication. A page can ask AuthContext "do we have a logged-in user?" or "who is the current user?" instead of building that logic from scratch.
- [frontend/src/components/Auth/ProtectedRoute.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/Auth/ProtectedRoute.jsx): This is the guard in front of protected pages. When a user tries to open Trial, Results, Admin, or other protected routes, this component checks the shared auth state from AuthContext and decides whether to let them in or send them back to the login flow. You can think of it like a checkpoint at the door that asks, "is this user signed in, and are they allowed to be here?"
- [frontend/src/utilities/api.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/api.js): This file is the shared frontend-to-backend bridge. Instead of every component building its own fetch or axios calls, they use these helpers so token headers, backend URLs, and error formatting stay consistent everywhere.
- [frontend/src/components/TestManager/TestManager.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/TestManager/TestManager.jsx): This is the main working screen for experiments. It renders the form for test settings, starts and stops runs, shows time remaining and counts, lets the operator prime the pump, and handles saving or loading presets.
- [frontend/src/components/ResultsList/ResultsList.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/ResultsList/ResultsList.jsx): This screen asks the backend for saved runs and turns them into something the user can read or export. If someone wants to understand how results show up in the UI, this is the first place to look.
- [frontend/src/components/PresetManager/preset_manager.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/PresetManager/preset_manager.jsx): This is the UI for saved experiment templates. It lets a user review previously saved settings, reuse them later, and manage presets without retyping the same test values every time.
- [frontend/src/components/Admin/AdminPanel.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/Admin/AdminPanel.jsx): This is the approval and access-control screen for administrators. It loads pending users from the backend and gives admins buttons to approve or disable accounts. It is also where an admin can set a new password for a user who forgot theirs, which immediately signs that user out of any existing sessions.
- [frontend/src/components/IoTestingGrid/IoTestingGrid.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/IoTestingGrid/IoTestingGrid.jsx): This is a simpler diagnostic view for hardware signals and counts. It is useful when you want to confirm that inputs like lever presses or nose pokes are being seen by the system.
- [frontend/src/utilities/presets.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/presets.js): This utility helps translate preset data into the shape the UI and backend expect. It also carries forward older preset formats so people do not lose saved settings when the app structure changes.
- [frontend/src/utilities/resultsCsv.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/resultsCsv.js): This utility builds the CSV output for downloads. Keeping that formatting in one place makes it easier to keep live-run exports and saved-result exports consistent.

### Backend structure

The backend entry point is [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py). It contains the Flask app, route definitions, and the main service objects that coordinate the experiment lifecycle.

Main backend modules:

- [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py): This is the main backend application file. It defines the Flask app, exposes the HTTP routes the frontend calls, and wires together the classes that manage tests, hardware, persistence, and error handling.
- `TestConfiguration`: This class takes raw form data from the frontend and turns it into a clean, consistent configuration object. It is where values are checked, defaults are applied, and field names are normalized so the rest of the backend can trust what it receives.
- `SQLiteTestRepository`: This class is the database layer for experiment data. It knows how to create or upgrade tables, save a configured test, update a running test, mark it finished, and load past results back out of SQLite.
- `SkinnerHardware`: This class is the backend's hardware translator. The rest of the backend says things like "turn on the running LED" or "play the end chime," and this class converts those high-level requests into GPIO or OLED adapter calls.
- `TestSessionManager`: This class is the heart of the experiment runtime. It remembers the current session in memory, starts and stops tests, keeps track of elapsed and remaining time, counts inputs, updates the database, and prepares the status JSON that the frontend polls.
- [backend/auth.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/auth.py): This file contains the authentication system. It creates users, verifies passwords, issues or revokes bearer tokens, tracks approval state, resets user passwords from the admin console, and gives the backend a single place to manage network access.
- [backend/shared_errors.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/shared_errors.py): This file defines the predictable error format shared with the frontend. Instead of returning random exceptions or vague messages, the backend can raise structured errors that React can show in a clear MUI alert.
- [backend/gpio_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/gpio_adapter.py): This adapter makes the same backend code work on both a laptop and a Raspberry Pi. In mock mode it creates fake hardware objects for testing, and in real mode it uses `gpiozero` devices on the Pi.
- [backend/display_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/display_adapter.py): This does the same job for OLED displays that `gpio_adapter.py` does for GPIO. It lets the backend write display messages in one consistent way whether the current machine has real I2C OLED hardware or not.
- [backend/reset_admin.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/reset_admin.py): This is the local recovery and bootstrap tool for administrators. If nobody can log in yet, this script is how you create or reset an approved admin account from the machine itself.
- [backend/tests/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests): This folder contains the backend regression tests. These tests simulate API calls, auth flows, GPIO behavior, OLED behavior, and trial execution so developers can catch regressions without needing the actual box connected.

### Where to make common changes

If you need to add or change behavior, these are the first places to look:

- add a new API endpoint: [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py) and [frontend/src/utilities/api.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/api.js)
- add a new trial setting: [frontend/src/components/TestManager/TestManager.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/TestManager/TestManager.jsx), [frontend/src/utilities/presets.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/presets.js), [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py), and the results/CSV utilities if it should be persisted or exported
- change authentication behavior: [backend/auth.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/auth.py), [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py), [frontend/src/context/AuthContext.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/context/AuthContext.jsx), and [frontend/src/components/Auth/ProtectedRoute.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/Auth/ProtectedRoute.jsx)
- change GPIO pins or box indicators: [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py) and [backend/gpio_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/gpio_adapter.py)
- change OLED content: [backend/display_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/display_adapter.py) and the display-update helpers in [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py)
- change result export format: [frontend/src/utilities/resultsCsv.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/resultsCsv.js) and [frontend/src/components/ResultsList/ResultsList.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/ResultsList/ResultsList.jsx)
- change preset storage rules: [frontend/src/utilities/presets.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/utilities/presets.js), [frontend/src/components/PresetManager/preset_manager.jsx](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/PresetManager/preset_manager.jsx), and preset routes in [backend/sbBackend.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/sbBackend.py)

### Testing and debugging expectations

If you are not sure where to start, start with the one-command regression runner from the repository root:

```bash
python3 scripts/run_regression_suite.py
```

This is the easiest "run everything and show me the results" command in the project.

What it does:

- backend: runs the Python `unittest` suites in mock GPIO and mock OLED mode, so it checks auth, trial flow, timers, counts, presets, database behavior, GPIO abstraction, OLED updates, and error handling without needing the real box attached
- frontend tests: runs the React/Jest smoke test, which checks that the app can still render the main UI shell and key entry links
- frontend build: runs the production React build, which catches compile errors and import/configuration problems that might not show up in the smoke test alone

What the results usually look like:

- backend tests print many lines ending in `... ok` when each test passes
- frontend Jest ends with `PASS` when the frontend smoke test succeeds
- the regression runner ends with `Regression suite passed.` when all three steps succeeded

Typical successful output looks roughly like this:

```text
=== Backend unittest suite ===
...
Ran 23 tests in 2.0s

OK

=== Frontend Jest smoke tests ===
...
PASS src/components/App/App.test.js

=== Frontend production build ===
...
Compiled with warnings.

Regression suite passed.
```

How to interpret the result:

- `ok` or `OK` means the backend test checks passed
- `PASS` means the frontend smoke test passed
- `Compiled with warnings.` means the frontend build succeeded, but there are warnings to review later
- `FAIL` means a test ran but one of its checks did not match the expected result
- `ERROR` means something crashed during the test run

Before changing core behavior, it also helps to know how the project is usually validated:

- backend regression coverage lives in [backend/tests/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests)
- frontend smoke coverage lives in [frontend/src/components/App/App.test.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/App/App.test.js)
- end-to-end API smoke flows live in the Postman assets under [postman/](/Users/egweinberg/Documents/skinnerbox-fullstack-student/postman)
- the quickest combined validation path is [scripts/run_regression_suite.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/scripts/run_regression_suite.py)

### What the current automated tests actually do

For beginners, it helps to think of the tests as small stories. Each one sets up a situation, performs an action, and checks that the app responds the way a real user or device would expect.

[backend/tests/test_auth_integration.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests/test_auth_integration.py) checks the login and approval rules:

- `test_protected_results_route_requires_authentication`: proves that someone cannot fetch saved results unless they send a valid token.
- `test_registered_user_must_be_approved_before_login`: walks through the full approval flow. A user registers, gets blocked while still pending, an admin approves them, and then the user can log in successfully.
- `test_admin_can_reset_an_operator_password_and_revoke_old_sessions`: shows the recovery flow. An admin sets a new password for an operator, the old password stops working, old tokens are revoked, and the operator can sign in with the new password.
- `test_logout_revokes_the_current_bearer_token`: proves that logging out really invalidates the token instead of just hiding the UI.
- `test_upsert_admin_creates_an_approved_admin_account`: verifies that the local admin bootstrap path creates an admin who is already approved and ready to use.

[backend/tests/test_gpio_adapter.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests/test_gpio_adapter.py) checks how the app decides between fake laptop hardware and real Raspberry Pi hardware:

- `test_auto_mode_uses_mock_when_not_on_raspberry_pi`: proves that `GPIO_MODE=auto` stays safe on a normal computer.
- `test_auto_mode_uses_real_when_raspberry_pi_is_detected`: proves that `auto` switches to real GPIO on a detected Pi.
- `test_explicit_mock_override_is_respected`: proves that forcing `mock` wins even if the code thinks it is on a Pi.
- `test_explicit_real_override_is_respected`: proves that forcing `real` wins even if the detector says it is not on a Pi.
- `test_invalid_mode_falls_back_to_auto_detection`: proves that a bad mode string does not crash the app and instead falls back to safe detection logic.

[backend/tests/test_gpio_scripts.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests/test_gpio_scripts.py) checks the standalone helper scripts:

- `test_run_pump_uses_shared_gpio_adapter`: proves that the pump helper script uses the same shared mock/real abstraction as the main backend instead of talking directly to raw GPIO code.
- `test_gpiotest_builds_mock_devices_without_real_gpio`: proves that the GPIO test helper can create fake buttons and lights on a laptop, which is important for safe development without the physical box.

[backend/tests/test_sbbackend_integration.py](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/tests/test_sbbackend_integration.py) is the main backend behavior suite. It checks the actual experiment flow through the Flask API:

- `test_simulated_lever_presses_are_reported_by_counts_endpoint`: starts a test, sends fake lever presses, and proves that live counts and saved results match what happened.
- `test_backend_timer_finishes_test_without_frontend_timekeeping`: proves that the backend can end a test by time alone even if the frontend is not doing any timer logic.
- `test_finish_endpoint_marks_a_paused_test_complete_in_database`: proves that a paused test can be manually finished and that the database reflects that final state correctly.
- `test_tone_stimulus_is_reflected_in_saved_results`: proves that when a run uses a tone instead of a light, the saved result records the correct stimulus type.
- `test_oled_shows_waiting_status_after_configuration`: proves that after a test is configured but not started yet, the OLED shows the expected ready screen.
- `test_oled_shows_remaining_time_and_lever_count_while_running`: proves that during a running test, the OLED updates with the remaining time and current lever count.
- `test_running_indicator_turns_off_and_end_chime_runs_when_enabled`: proves that the running LED turns off at the end and that the configured end chime pattern is actually used and saved.
- `test_runtime_error_blinks_error_led_until_next_successful_configuration`: simulates a hardware failure and proves that the backend reports the error, stops the run, and turns on the error indicators until the system is reconfigured successfully.
- `test_pump_prime_endpoint_runs_before_a_test`: proves that the priming endpoint can run the pump by itself before an experiment begins.
- `test_pump_prime_endpoint_is_blocked_while_test_is_running`: proves that the pump cannot be primed in the middle of an active test, which protects the experiment flow.
- `test_repository_migrates_legacy_active_test_schema`: proves that older SQLite database layouts are upgraded instead of breaking when the app starts.
- `test_presets_can_be_saved_listed_updated_and_deleted_per_user`: proves that authenticated users can manage their own presets and that one user's preset data is handled like real saved account data rather than temporary browser-only state.

[frontend/src/components/App/App.test.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/src/components/App/App.test.js) is a frontend smoke test:

- `renders the home page and primary navigation`: proves that the React app can render the home route and that key entry-point links like login and register are visible. It is a quick "does the app boot at all?" check rather than a full browser workflow test.

### How to run a test when you want to check one specific thing

If you are a beginner, the easiest way to think about this is:

- run the whole regression suite when you changed a lot
- run one backend test file when you changed one backend area
- run one exact test method when you want to check one specific behavior

To run all backend tests:

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest discover -s tests -v
```

To run one backend test file:

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest tests.test_auth_integration -v
```

To run one exact backend test method:

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest tests.test_sbbackend_integration.SkinnerBoxApiIntegrationTest.test_simulated_lever_presses_are_reported_by_counts_endpoint -v
```

To run the frontend smoke test:

```bash
cd frontend
CI=true npm test -- --watch=false
```

To run the full project regression checks from the repository root:

```bash
python3 scripts/run_regression_suite.py
```

Here is the beginner-friendly shortcut for choosing which test to run:

- if you changed login, approval, logout, or admin access rules: run `tests.test_auth_integration`
- if you changed mock-vs-real GPIO selection: run `tests.test_gpio_adapter`
- if you changed `run_pump.py` or `gpiotest.py`: run `tests.test_gpio_scripts`
- if you changed test start/stop flow, timers, counts, presets, pump priming, OLED updates, results, or hardware behavior in the main backend: run `tests.test_sbbackend_integration`
- if you changed app startup, routing, or whether the main UI renders: run the frontend smoke test in `App.test.js`

Examples:

- "I changed auth and want to confirm pending users still cannot log in":

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest tests.test_auth_integration.AuthenticationIntegrationTest.test_registered_user_must_be_approved_before_login -v
```

- "I changed lever-count behavior and want to confirm simulated presses still work":

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest tests.test_sbbackend_integration.SkinnerBoxApiIntegrationTest.test_simulated_lever_presses_are_reported_by_counts_endpoint -v
```

- "I changed OLED status lines and want to confirm the running screen still updates":

```bash
cd backend
source .venv/bin/activate
PYTHONPYCACHEPREFIX=/tmp GPIO_MODE=mock OLED_MODE=mock .venv/bin/python -m unittest tests.test_sbbackend_integration.SkinnerBoxApiIntegrationTest.test_oled_shows_remaining_time_and_lever_count_while_running -v
```

- "I changed the React app shell and want to make sure it still boots":

```bash
cd frontend
CI=true npm test -- --watch=false
```

How to read the output:

- `ok` means that test passed
- `FAIL` means the test ran but one of its checks did not match the expected result
- `ERROR` means the test crashed before it could finish, often because of an exception or missing setup

When you are not sure which test matters most, run the full regression runner. It is slower, but it is the safest choice.

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
- protected pages include Trial, Results, I/O Config, Preset Manager, and Admin
- presets are saved per approved user account and are available from both Trial and Preset Manager after sign-in

Admin accounts are managed locally with the backend reset script instead of through the web UI.

### Default Validation Admin

The bundled [backend/testdatabase.db](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/testdatabase.db) now includes a default admin account for local testing and validation:

- email: `admin@example.com`
- password: `AdminPass123`

The demo-data seeder also reuses this same admin account when it needs to approve demo operators. It does not create a separate demo-only admin anymore.

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

Install the Raspberry Pi system packages that the GPIO/OLED stack expects first:

```bash
sudo apt update
sudo apt install -y liblgpio-dev liblgpio1 swig python3-dev build-essential
```

On current Debian-based Raspberry Pi systems, this project uses `gpiozero` with
the `lgpio` backend. The backend launcher now prefers
`GPIOZERO_PIN_FACTORY=lgpio` automatically on a detected Raspberry Pi, and the
bundled `systemd` service sets it explicitly.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
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
./run_frontend.sh
```

`run_frontend.sh` now builds the React app to use relative `/api` requests by default and serves the built files with a small Node/Express server that proxies `/api/*` to the configured backend. That means browsers on other machines can use the Pi frontend without baking the Pi IP into the bundle.

If the frontend server is running on another machine instead of the Pi, point its runtime proxy at the Pi backend:

```bash
cd frontend
BACKEND_HOST=<pi-ip> BACKEND_PORT=5000 ./run_frontend.sh
```

If the Pi backend is using a non-default port, include that port in the frontend proxy target:

```bash
cd frontend
BACKEND_HOST=<pi-ip> BACKEND_PORT=5001 ./run_frontend.sh
```

If you already built the frontend and do not want to rebuild on every service start, disable the automatic build step:

```bash
cd frontend
FRONTEND_BUILD_ON_START=0 ./run_frontend.sh
```

For a more production-like Pi setup, build once after a frontend change:

```bash
cd frontend
npm run build
```

Then let the service serve that built output without rebuilding on boot.

### Boot services on Ubuntu / Raspberry Pi

The updated launchers are designed for `systemd`:

- [backend/run_backend.sh](/Users/egweinberg/Documents/skinnerbox-fullstack-student/backend/run_backend.sh) activates the virtual environment, forces a single Flask process without the reloader, and writes logs to [logs/backend.log](/Users/egweinberg/Documents/skinnerbox-fullstack-student/logs/backend.log) and [logs/backend.error.log](/Users/egweinberg/Documents/skinnerbox-fullstack-student/logs/backend.error.log).
- [frontend/run_frontend.sh](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/run_frontend.sh) builds the frontend with same-origin `/api` requests by default, serves the built files through [frontend/server.js](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/server.js), proxies `/api/*` to the configured backend target, and writes logs to [logs/frontend.log](/Users/egweinberg/Documents/skinnerbox-fullstack-student/logs/frontend.log) and [logs/frontend.error.log](/Users/egweinberg/Documents/skinnerbox-fullstack-student/logs/frontend.error.log).

Ready-to-copy unit files are included here:

- [deploy/systemd/skinnerbox-backend.service](/Users/egweinberg/Documents/skinnerbox-fullstack-student/deploy/systemd/skinnerbox-backend.service)
- [deploy/systemd/skinnerbox-frontend.service](/Users/egweinberg/Documents/skinnerbox-fullstack-student/deploy/systemd/skinnerbox-frontend.service)

Example backend service:

```ini
[Unit]
Description=SkinnerBox backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ladew222
WorkingDirectory=/home/ladew222/skinnerbox-fullstack-student/backend
Environment=GPIO_MODE=auto
Environment=OLED_MODE=auto
Environment=GPIOZERO_PIN_FACTORY=lgpio
Environment=FLASK_RUN_PORT=5000
ExecStart=/bin/bash /home/ladew222/skinnerbox-fullstack-student/backend/run_backend.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Example frontend service:

```ini
[Unit]
Description=SkinnerBox frontend
After=network-online.target skinnerbox-backend.service
Wants=network-online.target

[Service]
Type=simple
User=ladew222
WorkingDirectory=/home/ladew222/skinnerbox-fullstack-student/frontend
Environment=BACKEND_HOST=localhost
Environment=BACKEND_PORT=5000
Environment=FRONTEND_PORT=3000
Environment=FRONTEND_BUILD_ON_START=0
ExecStart=/bin/bash /home/ladew222/skinnerbox-fullstack-student/frontend/run_frontend.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

These examples now assume the Pi user is `ladew222`. If your repository lives somewhere else, update the `WorkingDirectory=` and `ExecStart=` paths before enabling the services.

After copying those files into `/etc/systemd/system`, run:

```bash
sudo cp deploy/systemd/skinnerbox-backend.service /etc/systemd/system/
sudo cp deploy/systemd/skinnerbox-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable skinnerbox-backend.service skinnerbox-frontend.service
sudo systemctl start skinnerbox-backend.service skinnerbox-frontend.service
```

Useful service checks:

```bash
sudo systemctl status skinnerbox-backend.service
sudo systemctl status skinnerbox-frontend.service
tail -f logs/backend.log logs/backend.error.log
tail -f logs/frontend.log logs/frontend.error.log
```

If you do want the Pi to rebuild the frontend automatically after a pull, temporarily set `FRONTEND_BUILD_ON_START=1` in the service, restart it once, and then switch it back to `0`.

## Changing Ports

The default local setup is:

- frontend dev server: `3000`
- backend Flask server: `5000`

If you need different ports, all clients must agree on the backend port.

Backend:

- direct Flask run on a computer: change `--port=5000` to your chosen port
- `run_backend.sh` on the Pi: set `FLASK_RUN_PORT=<port>`

Frontend:

- `./run_frontend.sh` proxies `/api` to `http://localhost:5000` by default
- if the backend uses another port on the same machine, start the frontend with `BACKEND_PORT=<port> ./run_frontend.sh`
- if the frontend server is on another machine, use `BACKEND_HOST=<backend-host> BACKEND_PORT=<port> ./run_frontend.sh`
- only set `REACT_APP_BACKEND_URL=http://<backend-host>:<port>` when the built frontend will be served by something that cannot proxy `/api`
- if you want the frontend service itself on another port, set `FRONTEND_PORT=<port>`

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
BACKEND_PORT=5001 ./run_frontend.sh
```

- Pi backend on `5001`, frontend on another computer:

```bash
cd backend
source .venv/bin/activate
FLASK_RUN_PORT=5001 GPIO_MODE=auto OLED_MODE=auto ./run_backend.sh
```

```bash
cd frontend
BACKEND_HOST=<pi-ip> BACKEND_PORT=5001 ./run_frontend.sh
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

Demo data for Results and Presets:

From the repository root:

```bash
cd /Users/egweinberg/Documents/skinnerbox-fullstack-student
backend/.venv/bin/python scripts/generate_demo_results.py --database backend/testdatabase.db --count 18 --reset-demo
```

What this does:

- removes older demo trials first when `--reset-demo` is used
- seeds fake saved trials for the Results page
- creates or updates one preset named `Demo Preset - Training`
- stores that preset under the validation admin account `admin@example.com`

How to use it after loading:

1. Start or restart the backend so it is using the same `backend/testdatabase.db` file.
2. Sign in as `admin@example.com` with password `AdminPass123`.
3. Open `/Results` to view the seeded demo trials and charts.
4. Search for `Demo Trial` if you want the charts to summarize only the seeded demo runs.
5. Open `/Trial` or `/PresetManager` to find the preset `Demo Preset - Training`.

Useful variations:

- create more demo runs:

```bash
backend/.venv/bin/python scripts/generate_demo_results.py --database backend/testdatabase.db --count 30 --reset-demo
```

- clear all saved results without reseeding:

```bash
backend/.venv/bin/python scripts/generate_demo_results.py --database backend/testdatabase.db --clear-all-results --clear-only
```

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
