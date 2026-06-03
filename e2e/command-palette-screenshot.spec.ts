import { test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Manual screenshot check for the global command palette / insta-search.
// Boots the built dashboard online (mocked service) and captures the header
// trigger plus several palette states. Run with:
//   npx playwright test command-palette-screenshot --project=chromium
const OUT = join(process.cwd(), '.deep-build', 'search-shots');

test.use({ viewport: { width: 1440, height: 960 } });

async function mockService(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify(['y70']));
    localStorage.setItem('nexus_simulate_y70', '1');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: !query.includes('light'),
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }),
    });
  });
  await page.route('**/sw.js', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('http://localhost:9400/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/ping') return json({ service: 'nexus', version: 'test', initialized: true, platform: 'windows' });
    if (path === '/pair') return json({ token: 'test-token' });
    if (path === '/profiles') return json({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' });
    if (path === '/preferences') return json({ theme: { language: 'en', themeMode: 'dark', accentColor: '#2563eb' } });
    if (path === '/devices/all') return json([]);
    if (path === '/panel/devices') return json({ devices: [] });
    if (path === '/peripherals') return json({ peripherals: [] });
    if (path === '/panel/status' || path === '/panel/y70/status') return json({ msg: 'running', kioskRunning: true, phoneConnected: false, phoneSubscribers: 0 });
    return json({}); // catch-all so nothing hangs
  });
}

test('command palette screenshots', async ({ page }) => {
  await mkdir(OUT, { recursive: true });
  await mockService(page);

  await page.goto('/system/monitoring');
  const trigger = page.getByRole('button', { name: 'Search Nexus' });
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, '1-header-trigger.png') });

  // Open via the global shortcut.
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '2-palette-suggestions.png') });

  await input.fill('set');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '3-query-settings.png') });

  await input.fill('12*8');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '4-query-calc.png') });

  await input.fill('dark');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '5-query-dark.png') });

  await input.fill('y70');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '6-query-device.png') });

  // Deep settings: "tray" must surface the actual setting, not just the tab.
  await input.fill('tray');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '7-query-tray.png') });

  // Cooling + lighting methods (immediate actions, ⚡) alongside the page
  // navigations (↗).
  await input.fill('cool');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '8-query-cooling.png') });

  await input.fill('light');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '9-query-lighting.png') });
});
