import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * These tests drive a real Chromium against the built bundle, because the things
 * they check cannot be checked in Node: integer scaling, canvas painting, Web
 * Audio unlocking, pointer mapping through the CSS scale, and localStorage. The
 * suite builds first so it can never test a stale `dist/`.
 */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // `forbidOnly`, `retries` and the CI reporter are left to Playwright, which
  // already switches them on from its own environment detection.
  use: {
    baseURL: BASE_URL,
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Build inside the web server so `dist/` always matches the sources under test.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
