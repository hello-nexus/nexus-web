import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
// server.js host-routes `/`: my.* hosts get the SPA shell, everything else the
// marketing page. App-surface specs need the SPA at `/`, so the baseURL is the
// my. host (*.localhost resolves to loopback in browsers, macOS, and
// systemd-resolved). The webServer readiness probe keeps plain localhost.
const BASE_URL = `http://my.localhost:${PORT}`;
const SERVER_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Tests share one webServer; running them serially avoids Chromium-vs-server
  // contention that surfaces as flaky locator timeouts under load.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `PORT=${PORT} node server.js`,
    url: SERVER_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
