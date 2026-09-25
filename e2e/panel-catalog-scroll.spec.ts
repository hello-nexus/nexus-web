// The add-widget catalog on a panel device page scrolls inside its own pane.
// Layout-only, so jsdom cannot see it: a wrapper that breaks the flex height
// chain lets the catalog grow to its content, clipped by the pane.

import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 720 } });

const Y70_NAME = 'HYTE Y70 Touch Infinite';

async function mockService(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.routeWebSocket(/\/ws(\?|$)/, () => {});
  // The SPA calls the service on its own origin (my.localhost:9400), so REST is
  // told apart from the bundle by request type, not host.
  await page.route('**/*', async route => {
    const type = route.request().resourceType();
    const path = new URL(route.request().url()).pathname;
    if ((type !== 'fetch' && type !== 'xhr') || path.startsWith('/assets/')) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/ping') return json({ service: 'nexus', version: 'test', initialized: true, platform: 'windows' });
    if (path === '/pair') return json({ token: 'test-token' });
    if (path === '/onboarding') return json({ completed: true });
    if (path === '/defaults') return json({ panel: { layouts: {} } });
    if (path === '/profiles') return json({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' });
    if (path === '/devices/all') return json([{ id: 'y70', name: Y70_NAME, category: 'display', connected: true }]);
    if (path === '/panel/devices') return json({ devices: [] });
    return route.fulfill({ status: 404, body: '' });
  });
}

test('y70 widget catalog scrolls inside the device page', async ({ page }) => {
  await mockService(page);
  await page.goto('/');
  await page.locator('[class*="sidebarColumn"]').getByRole('button', { name: Y70_NAME }).first().click();

  const scroller = page.locator('[class*="leftPane"] [class*="scroller"]');
  await expect(scroller.locator('button').first()).toBeVisible({ timeout: 10_000 });

  const metrics = () => scroller.evaluate(el => {
    const paneRect = el.closest('[class*="leftPane"]')!.getBoundingClientRect();
    return {
      overhang: el.getBoundingClientRect().bottom - paneRect.bottom,
      overflow: el.scrollHeight - el.clientHeight,
      scrollTop: el.scrollTop,
    };
  });

  const before = await metrics();
  expect(before.overhang).toBeLessThanOrEqual(1);
  expect(before.overflow).toBeGreaterThan(0);

  await scroller.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await metrics()).scrollTop).toBeGreaterThan(0);
});
