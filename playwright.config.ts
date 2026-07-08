import { defineConfig, devices } from '@playwright/test';

// Default to the service HTTP port: src/api/service.ts derives
// isServedFromService from location.port (9400/9443), and a non-service
// port makes the app treat itself as a REMOTE origin - localhost REST is
// blocked in favor of the relay transport, so every spec that stubs
// /ping et al. boots into the offline overlay. Serving on 9400 puts the
// specs on the same origin class as a real kiosk/dashboard panel. A live
// local service on 9400 would collide; server.js then fails to bind and
// the run aborts loudly instead of silently testing against the service.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 9400);
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
    // Never reuse on the service port: a listener on 9400 would be a REAL
    // local Nexus service, and reuse would silently run every spec against
    // it. Starting our own server EADDRINUSE-aborts instead. A custom
    // PLAYWRIGHT_PORT keeps the old reuse behavior for iterating.
    reuseExistingServer: !process.env.CI && PORT !== 9400,
    timeout: 30_000,
  },
});
