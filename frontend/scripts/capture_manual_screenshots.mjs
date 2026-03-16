#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { accessSync, constants as fsConstants, promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(frontendDir, '..');

const defaultConfig = {
  frontendUrl: process.env.MANUAL_FRONTEND_URL || 'http://localhost:3000',
  email: process.env.MANUAL_ADMIN_EMAIL || 'admin@example.com',
  password: process.env.MANUAL_ADMIN_PASSWORD || 'AdminPass123',
  outputDir:
    process.env.MANUAL_SCREENSHOT_DIR ||
    path.join(projectRoot, 'docs', 'assets', 'user-manual', 'generated'),
  width: Number(process.env.MANUAL_SCREENSHOT_WIDTH || 1440),
  height: Number(process.env.MANUAL_SCREENSHOT_HEIGHT || 1100),
  seedDemo: process.env.MANUAL_SEED_DEMO === '1',
  demoCount: Number(process.env.MANUAL_DEMO_COUNT || 18),
  keepExisting: process.env.MANUAL_KEEP_EXISTING === '1',
};

const screenshotPlan = [
  { file: '01-login-page.png', title: 'Login page', section: 'Logging In' },
  { file: '02-home-page.png', title: 'Home page', section: 'Home Page' },
  { file: '03-io-config-page.png', title: 'I/O Config page', section: 'I/O Config' },
  { file: '04-trial-page.png', title: 'Trial setup page', section: 'Run A Trial' },
  { file: '05-preset-manager-page.png', title: 'Preset Manager page', section: 'Preset Manager' },
  { file: '06-results-overview.png', title: 'Results overview', section: 'Results' },
  { file: '07-results-detail.png', title: 'Results detail panel', section: 'Results' },
  { file: '08-results-timeline-trends.png', title: 'Timeline trends chart', section: 'Understanding The Charts' },
  { file: '09-admin-page.png', title: 'Admin page', section: 'Admin Page' },
  { file: '10-about-page.png', title: 'About page', section: 'Home Page' },
];

function printUsage() {
  console.log(`
Capture a consistent screenshot set for the SkinnerBox user manual.

Usage:
  cd /Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend
  npm run screenshots:manual -- [options]

Options:
  --seed-demo               Reseed demo results and the demo preset before capture
  --demo-count=18           Number of demo trials to seed when using --seed-demo
  --frontend-url=URL        Frontend base URL (default: http://localhost:3000)
  --email=EMAIL             Login email (default: admin@example.com)
  --password=PASSWORD       Login password (default: AdminPass123)
  --output-dir=PATH         Directory for generated screenshots
  --width=1440              Browser viewport width
  --height=1100             Browser viewport height
  --keep-existing           Keep existing PNG files in the output directory
  --help                    Show this help

Requirements:
  - Backend and frontend already running
  - A local Chrome install (or set PLAYWRIGHT_EXECUTABLE_PATH)
  - Use --seed-demo if you want consistent demo content for the Results page
`);
}

function parseArgs(argv) {
  const config = { ...defaultConfig };

  for (const arg of argv) {
    if (arg === '--help') {
      config.help = true;
    } else if (arg === '--seed-demo') {
      config.seedDemo = true;
    } else if (arg === '--keep-existing') {
      config.keepExisting = true;
    } else if (arg.startsWith('--frontend-url=')) {
      config.frontendUrl = arg.slice('--frontend-url='.length);
    } else if (arg.startsWith('--email=')) {
      config.email = arg.slice('--email='.length);
    } else if (arg.startsWith('--password=')) {
      config.password = arg.slice('--password='.length);
    } else if (arg.startsWith('--output-dir=')) {
      config.outputDir = path.resolve(arg.slice('--output-dir='.length));
    } else if (arg.startsWith('--demo-count=')) {
      config.demoCount = Number(arg.slice('--demo-count='.length));
    } else if (arg.startsWith('--width=')) {
      config.width = Number(arg.slice('--width='.length));
    } else if (arg.startsWith('--height=')) {
      config.height = Number(arg.slice('--height='.length));
    }
  }

  return config;
}

async function ensureOutputDirectory(outputDir, keepExisting) {
  await fs.mkdir(outputDir, { recursive: true });

  if (!keepExisting) {
    const currentFiles = await fs.readdir(outputDir);
    await Promise.all(
      currentFiles
        .filter((name) => name.endsWith('.png') || name.endsWith('.json'))
        .map((name) => fs.rm(path.join(outputDir, name), { force: true }))
    );
  }
}

function resolveBrowserExecutablePath() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  for (const candidatePath of candidates) {
    try {
      accessSync(candidatePath, fsConstants.X_OK);
      return candidatePath;
    } catch (error) {
      // Try the next candidate path.
    }
  }

  return undefined;
}

function seedDemoData(demoCount) {
  const pythonPath = path.join(projectRoot, 'backend', '.venv', 'bin', 'python');
  const databasePath = path.join(projectRoot, 'backend', 'testdatabase.db');
  const demoScriptPath = path.join(projectRoot, 'scripts', 'generate_demo_results.py');

  const result = spawnSync(
    pythonPath,
    [demoScriptPath, '--database', databasePath, '--count', String(demoCount), '--reset-demo'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Unable to seed demo data.\n${result.stdout || ''}\n${result.stderr || ''}`.trim()
    );
  }
}

async function waitForStablePage(page) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 2500 });
  } catch (error) {
    // Some pages poll the backend continuously, so a fully idle network is not required here.
  }
  await page.waitForTimeout(300);
}

async function captureLocator(locator, outputPath) {
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({
    path: outputPath,
    animations: 'disabled',
  });
}

async function maybeLoadDemoPreset(page) {
  const presetCombobox = page.locator('#formControlContainer [role="combobox"]').first();
  if ((await presetCombobox.count()) === 0) {
    return false;
  }

  await presetCombobox.click();

  const demoPresetOption = page.getByRole('option', { name: /Demo Preset - Training/i });
  if ((await demoPresetOption.count()) === 0) {
    await page.keyboard.press('Escape');
    return false;
  }

  await demoPresetOption.click();
  await page.waitForTimeout(300);
  return true;
}

async function captureManualScreenshots(config) {
  const executablePath = resolveBrowserExecutablePath();
  if (!executablePath) {
    throw new Error(
      'No Chrome/Chromium executable was found. Install Chrome or set PLAYWRIGHT_EXECUTABLE_PATH before running the screenshot script.'
    );
  }

  if (config.seedDemo) {
    console.log(`Seeding ${config.demoCount} demo trials before screenshot capture...`);
    seedDemoData(config.demoCount);
  }

  await ensureOutputDirectory(config.outputDir, config.keepExisting);

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: {
      width: config.width,
      height: config.height,
    },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const manifestEntries = [];

  const saveShot = async (planEntry, locator) => {
    const outputPath = path.join(config.outputDir, planEntry.file);
    await captureLocator(locator, outputPath);
    manifestEntries.push({
      ...planEntry,
      path: outputPath,
      capturedAt: new Date().toISOString(),
    });
    console.log(`Saved ${planEntry.file}`);
  };

  try {
    await page.goto(new URL('/LogIn', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'Sign In' }).waitFor();
    await saveShot(screenshotPlan[0], page.locator('.trial-settings'));

    await page.locator('#loginEmail').fill(config.email);
    await page.locator('#loginPassword').fill(config.password);
    await page.locator('#btnLogin').click();
    await page.waitForURL(/\/(Admin|Trial)/);
    await waitForStablePage(page);

    await page.goto(new URL('/Home', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'SkinnerBox Trial Control' }).waitFor();
    await saveShot(screenshotPlan[1], page.locator('.home-page'));

    await page.goto(new URL('/IoTesting', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'I/O Config' }).waitFor();
    await saveShot(screenshotPlan[2], page.locator('.iotesting-settings'));

    await page.goto(new URL('/Trial', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'Configure a Trial' }).waitFor();
    await maybeLoadDemoPreset(page);
    await saveShot(screenshotPlan[3], page.locator('.trial-settings'));

    await page.goto(new URL('/PresetManager', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'Preset Manager' }).waitFor();
    await saveShot(screenshotPlan[4], page.locator('.preset-manager-page'));

    await page.goto(new URL('/Results', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'Available Trials' }).waitFor();
    await page.locator('.search-bar').fill('Demo Trial');
    await page.waitForTimeout(400);
    await saveShot(screenshotPlan[5], page.locator('.results-container'));

    const firstResult = page.locator('.test-item').first();
    if ((await firstResult.count()) > 0) {
      await firstResult.click();
      await page.locator('.test-details').waitFor();
      await saveShot(screenshotPlan[6], page.locator('.test-details'));

      const trendsButton = page.getByRole('button', { name: /Show Timeline Trends/i });
      if ((await trendsButton.count()) > 0 && !(await trendsButton.isDisabled())) {
        await trendsButton.click();
        await page.locator('.results-trend-panel').waitFor();
        await saveShot(screenshotPlan[7], page.locator('.results-trend-panel'));
      }
    }

    await page.goto(new URL('/Admin', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByText('Access Administration').waitFor();
    await saveShot(screenshotPlan[8], page.locator('main.app-route-surface'));

    await page.goto(new URL('/About', config.frontendUrl).toString());
    await waitForStablePage(page);
    await page.getByRole('heading', { name: 'About Us' }).waitFor();
    await saveShot(screenshotPlan[9], page.locator('.about-page'));

    await fs.writeFile(
      path.join(config.outputDir, 'manifest.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          frontendUrl: config.frontendUrl,
          viewport: { width: config.width, height: config.height },
          screenshots: manifestEntries,
        },
        null,
        2
      ),
      'utf8'
    );
  } finally {
    await browser.close();
  }
}

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  printUsage();
  process.exit(0);
}

captureManualScreenshots(config)
  .then(() => {
    console.log(`Manual screenshots saved to ${config.outputDir}`);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
