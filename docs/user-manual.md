# SkinnerBox User Manual

## Purpose
This manual is the user-facing guide for the SkinnerBox system. It is meant to explain what each page does, how to use it, what the user should expect to happen, and what common mistakes to watch for.

This file is also the best place to build a screenshot-heavy manual over time. Each section below includes suggested screenshot slots and writing prompts so the manual stays consistent even as features evolve.

## How To Use This Manual
- Read the short `Purpose` line at the top of each section first.
- Follow the numbered steps in `How To Use It`.
- Compare your screen to the `Suggested Screenshot` notes.
- Use the `Common Issues` notes when something does not behave as expected.

## Screenshot Style Guide
Use one screenshot style throughout the manual so it feels consistent and easier to follow.

- Keep the browser window at a consistent size before taking screenshots.
- Crop tightly around the feature being explained.
- Use numbered callouts if one image supports a multi-step explanation.
- Prefer one main idea per screenshot.
- If a page is long, use two smaller screenshots instead of one giant one.
- When possible, show the expected result after an action, not only the form before it.

## Suggested Asset Structure
If you want to keep images in the repo, use a folder like:

```text
docs/assets/user-manual/
```

Suggested naming pattern:

```text
01-login-page.png
02-admin-approval.png
03-io-config-overview.png
```

## Screenshot Automation
If you want a consistent first draft of the screenshots, you can generate them with the Playwright-based capture script in the frontend.

### Best Use
Use the automation for:

- consistent browser size
- repeatable page-to-page capture
- refreshed screenshots after UI changes

Then manually keep, crop, annotate, or replace the screenshots you want in the final manual.

### Before You Run It
1. Start the backend.
2. Start the frontend.
3. Decide whether you want demo data in the screenshots.
4. If you want seeded demo content, use the `--seed-demo` option.

### Command
```bash
cd /Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend
npm run screenshots:manual -- --seed-demo
```

### What It Captures
The script saves a consistent set of page screenshots into:

```text
docs/assets/user-manual/generated/
```

It captures the major operator screens, including:

- login
- home
- I/O Config
- trial setup
- preset manager
- results overview
- results detail
- results timeline trends
- admin
- about

It also writes a `manifest.json` file next to the screenshots so you can match each image to the right section of this manual.

### Useful Options
```bash
npm run screenshots:manual -- --frontend-url=http://localhost:3001
npm run screenshots:manual -- --email=admin@example.com --password=AdminPass123
npm run screenshots:manual -- --output-dir=/custom/path
npm run screenshots:manual -- --keep-existing
```

### Notes
- The script assumes the app is already running.
- It uses a local Chrome install by default. If Chrome lives somewhere unusual, set `PLAYWRIGHT_EXECUTABLE_PATH`.
- The script is meant to give you a strong starting set, not the final polished manual by itself.

## Quick Start
### Purpose
This section should help a new user get from startup to a successful test run as quickly as possible.

### How To Use It
1. Start the backend and frontend.
2. Sign in with an approved account.
3. Open `I/O Config` and confirm hardware is responding.
4. Open `Run a Trial`, load a preset or enter values manually.
5. Start the test and watch the live counters.
6. Open `Results` to review the saved run and export data.

### Suggested Screenshot
- Home page after login, with the main navigation visible.

![Home page after sign-in](assets/user-manual/generated/02-home-page.png)

### What To Expect
- Users should be able to move from login to trial setup without needing Postman or direct backend access.

### Common Issues
- Backend not running or frontend pointed at the wrong backend port.
- User account not approved yet.

## Logging In
### Purpose
Explain how users sign in and what approval means.

### How To Use It
1. Open the sign-in page.
2. Enter the approved email and password.
3. Select `Sign In`.
4. If the account is pending, wait for an administrator to approve access.

### Suggested Screenshot
- Login page with the email/password fields and the main action buttons.

![Login page](assets/user-manual/generated/01-login-page.png)

### What To Expect
- Approved users are taken into the app.
- Pending users should see a message that they need approval before using the system.

### Common Issues
- Wrong password.
- Pending account not yet approved.
- Backend unavailable.

## Home Page
### Purpose
Explain the landing page and where users should go next.

### How To Use It
1. Read the short overview of what the system does.
2. Use the navigation to move to `I/O Config`, `Run a Trial`, `Results`, or `Preset Manager`.

### Suggested Screenshot
- Full home page hero area and the section that explains the normal workflow.

![Home landing page](assets/user-manual/generated/02-home-page.png)

### What To Expect
- The home page should act like a welcome page and directional guide, not a control panel.

### Common Issues
- Users may not know whether to start on `I/O Config` or `Run a Trial`; this section should explain that `I/O Config` is for setup/testing and `Run a Trial` is for the actual experiment.

## I/O Config
### Purpose
Explain the hardware and maintenance page. This is where users verify that the box hardware responds correctly and where default maintenance values are adjusted.

### What This Page Does
- Shows current hardware counts like lever presses and nose pokes.
- Lets the user manually run the pump for a set number of milliseconds.
- Lets the user adjust and save the default pump calibration value used during reward delivery.
- Lets the user adjust the lever debounce setting.
- Lets the user decide whether a lever must be released before another count is accepted.
- Provides real-time test actions like buzzer testing and other hardware checks.

### How To Use It
1. Open `I/O Config`.
2. Review the current default values shown on the page.
3. Use `Manual Run Pump` when testing the pump line.
4. Update `Pump Calibration` if the default reward pulse needs to change.
5. Update `Lever Debounce` if the lever is overcounting or undercounting.
6. Turn on the lever release requirement if a new count should only happen after a release.
7. Use the baseline reset buttons to measure fresh lever or nose-poke activity from the current moment.

### Suggested Screenshots
- Full I/O Config page overview.
- Maintenance settings area with current values visible.
- Lever and nose-poke baseline section.
- Pump and buzzer controls.

![I/O Config page](assets/user-manual/generated/03-io-config-page.png)

### What To Expect
- Manual hardware actions should happen right away.
- Baseline reset buttons should only reset the local `since baseline` counters on the page.
- Saved maintenance values should remain available after refresh or restart.

### Common Issues
- Confusing live totals with `since baseline` counters.
- Expecting a baseline reset to clear backend totals.
- Forgetting to save a new default after testing a new value.

## Run A Trial
### Purpose
Explain how to configure and start an actual behavioral test.

### What This Page Does
- Collects the trial configuration.
- Loads presets.
- Starts, pauses, resumes, stops, or finishes a test.
- Shows live status such as counts, elapsed time, and time remaining.
- Can play a browser notification sound when the test completes.

### Parameter Guide
Use this section to explain the fields in plain language for beginners.

#### Test Name
This is the label used to identify the run later in Results. It should be descriptive enough that someone can recognize the run without opening it.

#### Subject ID
This is optional. Use it when you want to associate the test with a specific animal or subject. Leave it blank when subject tracking is not being used.

#### Trial Duration
This is the total amount of time the test is allowed to run. The backend uses this value to determine when the test should end if it has not already ended by reaching its goal.

#### Goal For Trial
This is the number of required interactions before the system counts that portion of the task as complete and moves toward reward delivery.

#### Goal For Test
This is the overall goal for the session. It must make sense relative to the trial goal, because the full test should not end before a trial can complete.

#### Reward Type
This is currently fixed to water. Users should not expect food delivery as an active option right now.

#### Stimulus Type
This determines whether the box uses `Light`, `Tone`, or `Light + Tone` during the stimulus portion of the task.

#### Reward Delay
This is the time between a successful interaction goal and when the reward is actually delivered.

#### Stimulus Time
This is how long the chosen stimulus stays active during each cycle.

#### Cooldown
This is stored with the test configuration. If the current backend behavior changes over time, this field may become more important, so the manual should describe how the live system is currently using it.

#### End Chime
This simply tells the system whether the end-of-test chime should be active or inactive.

### How To Use It
1. Open `Run a Trial`.
2. Load a preset or enter values manually.
3. Review the form carefully before starting.
4. Select `Run Test`.
5. Watch the live counters and time remaining during the run.
6. Pause or finish the trial if needed.
7. Download the data if needed, then review the saved result in `Results`.

### Suggested Screenshots
- Trial form overview.
- Example of a completed form ready to start.
- Live running test state with counts and time remaining.
- Completed test state with available downloads.

![Trial configuration page](assets/user-manual/generated/04-trial-page.png)

### What To Expect
- The backend, not the frontend, owns the timer and completion logic.
- The page should update as the test progresses.
- Completion should be visible both in the page state and later in Results.

### Common Issues
- Confusing `Goal For Trial` and `Goal For Test`.
- Starting a test without reviewing the saved/default maintenance values in `I/O Config`.
- Expecting a manual pump prime to be part of starting a test.

## Preset Manager
### Purpose
Explain how users save, reuse, and maintain trial configurations.

### What This Page Does
- Saves reusable test settings tied to the signed-in account.
- Lets users load common setups instead of retyping values every time.

### How To Use It
1. Open `Preset Manager`.
2. Create a new preset or edit an existing one.
3. Save the preset.
4. Open `Run a Trial` and use that preset to auto-fill the form.

### Suggested Screenshot
- Preset list and a saved preset form.

![Preset Manager page](assets/user-manual/generated/05-preset-manager-page.png)

### What To Expect
- Presets should belong to the current authenticated user.
- Saved presets should appear later as auto-fill options in the Trial page.

### Common Issues
- Expecting one user’s presets to appear for another user.
- Forgetting to save after making changes.

## Results
### Purpose
Explain how users review, compare, chart, and export completed trials.

### What This Page Does
- Lists saved trials.
- Shows detail for a selected trial.
- Lets users download summary CSV files and timeline CSV files.
- Lets users compare multiple trials together.
- Shows chart summaries across visible or selected trials.

### How To Use It
1. Open `Results`.
2. Search for a trial by name if needed.
3. Select one saved trial to inspect its detail.
4. Check multiple trials to compare them in the charts and comparison table.
5. Download summary CSVs or event timeline CSVs as needed.

### Suggested Screenshots
- Results page overview.
- Selected trial detail panel.
- Multi-trial comparison section.
- Charts section with multiple trials selected.

![Results overview page](assets/user-manual/generated/06-results-overview.png)

![Selected result detail panel](assets/user-manual/generated/07-results-detail.png)

### What To Expect
- The summary panel should reflect either the filtered set or the checked selection, depending on the current page behavior.
- Timeline downloads should only work when event timeline data exists for that run.

### Common Issues
- Opening an old saved trial that has no event timeline.
- Expecting delete actions to work for non-admin accounts.

## Understanding The Charts
### Purpose
Help beginners understand what the summary charts mean.

### Suggested Explanations
- `Completion Overview`: shows how many selected trials completed versus how many did not.
- `Average Response Profile`: shows the average lever, nose-poke, and reward counts across the current set.
- `Interactions By Trial`: compares total activity from run to run.
- `Stimulus Mix`: shows how many selected trials used each stimulus mode.
- `Timeline Trends`: shows how events accumulated over time inside one run.

### Suggested Screenshot
- Results page with chart labels visible.

![Timeline trends chart](assets/user-manual/generated/08-results-timeline-trends.png)

## Admin Page
### Purpose
Explain what administrators can do and what normal users cannot do.

### What This Page Does
- Approves or disables users.
- Resets user passwords.
- Deletes non-admin users.

### How To Use It
1. Open `Admin`.
2. Review pending or approved users.
3. Approve, disable, reset password, or delete as needed.

### Suggested Screenshot
- Admin page showing one approved user and the available admin actions.

![Admin page](assets/user-manual/generated/09-admin-page.png)

### What To Expect
- Only admins should see and use this page.
- Deleting a user should remove the account while preserving historical run snapshots.

### Common Issues
- Expecting operators to have admin permissions.
- Confusing `Disable Access` with permanent deletion.

## Demo Data
### Purpose
Explain how to load fake content for demonstrations, screenshots, and chart reviews.

### How To Use It
1. Open a terminal in the repo root.
2. Run the demo seeder command.
3. Sign in as the validation admin.
4. Open `Results` to inspect the demo runs.
5. Open `Run a Trial` or `Preset Manager` to inspect the demo preset.

### Command
```bash
cd /Users/egweinberg/Documents/skinnerbox-fullstack-student
backend/.venv/bin/python scripts/generate_demo_results.py --database backend/testdatabase.db --count 18 --reset-demo
```

### Suggested Screenshot
- Results page populated with demo trials and charts.

![Demo results page](assets/user-manual/generated/06-results-overview.png)

### What To Expect
- Demo results should appear in Results.
- The validation admin should also see a demo preset.

### Common Issues
- Forgetting to refresh the backend or browser after seeding.
- Mistaking demo data for real study data.

## Startup And Shutdown
### Purpose
Document the normal way to start and stop the system on a laptop or Raspberry Pi.

### Suggested Subsections
- Local computer startup
- Raspberry Pi startup
- Service-based startup on the Pi
- How to change ports if needed
- Where logs are written

### Suggested Screenshot
- Optional terminal screenshot of a healthy backend or frontend startup.

## Troubleshooting
### Purpose
Give users a short list of fixes for the most common problems.

### Suggested Topics
- Cannot sign in
- Port already in use
- Backend not reachable
- Trial will not start
- No lever or nose-poke counts
- Timeline download not available
- Results delete requires admin
- Browser sound did not play on completion

## Revision Notes
Use this section to note when screenshots or instructions were last refreshed.

Example:

```text
Last reviewed for release branch: codex/skinnerbox-system-updates
Last screenshot refresh: 2026-03-16
```
