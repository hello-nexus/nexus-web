import { defineConfig, devices } from '@playwright/test';

// Isolated config for the SDK sandbox e2e: its own static server (host harness +
// worker bundles), so it does not depend on a full app build like the main e2e.
const PORT = Number(process.env.SANDBOX_PORT ?? 4317);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e-sandbox',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `SANDBOX_PORT=${PORT} node e2e-sandbox/server.mjs`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
