# Manual Maintenance Notes

This file is for maintainers who update the screenshot set and the user guide. It is not intended for everyday operators.

## Screenshot Workflow
The manual screenshots can be regenerated with the Playwright-based capture script.

### Command
```bash
cd /Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend
npm run screenshots:manual -- --seed-demo
```

### Output
The generated screenshots are written to:

```text
docs/assets/user-manual/generated/
```

The script also writes:

- `docs/assets/user-manual/generated/manifest.json`
- `docs/user-manual.local-preview.md`

The local preview file uses absolute image paths to make desktop Markdown viewers render more reliably.

## Best Use
Use the automation when you want:

- consistent browser size
- repeatable page captures
- a quick refreshed screenshot set after UI changes

Then manually replace or annotate any screenshots that need a more polished final presentation.

## Demo Content
If you want the Results page and Preset Manager to show stable demo content for screenshots, use the seeded demo flow.

### Demo Seeding Command
```bash
cd /Users/egweinberg/Documents/skinnerbox-fullstack-student
backend/.venv/bin/python scripts/generate_demo_results.py --database backend/testdatabase.db --count 18 --reset-demo
```

This creates:

- demo saved trials
- demo timelines
- the `Demo Preset - Training` preset for `admin@example.com`

## Notes
- The screenshot script assumes the backend and frontend are already running.
- It uses a local Chrome install by default.
- If Chrome is in an unusual place, set `PLAYWRIGHT_EXECUTABLE_PATH`.
