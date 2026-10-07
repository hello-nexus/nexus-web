// Dashboard window fit: widgets past the right edge show below the rest and
// return to their own cells when the window widens again, unless the user
// moved them.

import { expect, test, type Page } from '@playwright/test';

type Widget = { id: string; type: string; size: string; col: number; row: number };

const DASH_LAYOUT = {
  layoutSchemaVersion: 2,
  surface: 'desktop',
  pages: [
    {
      id: 'p0',
      widgets: [
        { id: 'w-a', type: 'clock', size: '4x4', col: 0, row: 0 },
        { id: 'w-b', type: 'clock', size: '4x4', col: 4, row: 0 },
        { id: 'w-c', type: 'clock', size: '4x4', col: 8, row: 0 },
        { id: 'w-d', type: 'clock', size: '4x4', col: 12, row: 0 },
      ],
    },
  ],
};

async function mockService(page: Page) {
  const saved: Widget[][] = [];
  let preferences: Record<string, unknown> = {
    language: 'en', themeMode: 'system', accentColor: '#22c55e',
    panel: { dashboardLayout: DASH_LAYOUT },
  };
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.routeWebSocket(/\/ws(\?|$)/, ws => { void ws; });
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/*', async route => {
    const request = route.request();
    const type = request.resourceType();
    const p = new URL(request.url()).pathname;
    if ((type !== 'fetch' && type !== 'xhr') || p.startsWith('/assets/')) return route.continue();
    if (p === '/ping') return route.fulfill(json({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }));
    if (p === '/pair') return route.fulfill(json({ token: 'test-token' }));
    if (p === '/onboarding') return route.fulfill(json({ completed: true }));
    if (p === '/profiles') return route.fulfill(json({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' }));
    if (p === '/preferences') {
      if (request.method() === 'POST') {
        const patch = request.postDataJSON() as { panel?: { dashboardLayout?: typeof DASH_LAYOUT } };
        if (patch.panel?.dashboardLayout) saved.push(patch.panel.dashboardLayout.pages[0].widgets as Widget[]);
        preferences = { ...preferences, ...patch };
        return route.fulfill(json({ error: false, msg: 'ok' }));
      }
      return route.fulfill(json(preferences));
    }
    if (p === '/cooling/status') return route.fulfill(json({ calibrating: false, calibrationState: 'idle', activeCurves: 0, fanCount: 0, manualFans: 0, activeCurveFanCount: 0 }));
    if (p === '/lighting/status') return route.fulfill(json({ effect: '', running: false, scanning: false }));
    if (p === '/panel/status') return route.fulfill(json({ msg: 'stopped', kioskRunning: false, phoneConnected: false, phoneSubscribers: 0 }));
    return route.fulfill({ status: 404, body: '' });
  });
  return saved;
}

const cell = (page: Page, id: string) => page.locator(`[data-surface="desktop"] [data-panel-widget-id="${id}"]`).first();
const columns = (page: Page) => page.locator('[data-surface="desktop"]').first()
  .evaluate(el => Number(getComputedStyle(el).getPropertyValue('--panel-columns')));
const expectShownAt = async (page: Page, id: string, col: number, row: number) => {
  await expect(cell(page, id)).toHaveAttribute('data-panel-cell-col', String(col));
  await expect(cell(page, id)).toHaveAttribute('data-panel-cell-row', String(row));
};
const stored = (saved: Widget[][], id: string) => {
  const w = saved[saved.length - 1].find(x => x.id === id)!;
  return [w.col, w.row];
};

// Grabs the widget at its center, puts its top-left on the target cell, and
// releases only once the drop highlight sits there.
async function drag(page: Page, id: string, col: number, row: number) {
  await expect.poll(() => cell(page, id).evaluate(el => el.getAnimations({ subtree: true })
    .filter(a => a.effect?.getTiming().iterations !== Infinity).length)).toBe(0);
  const from = (await cell(page, id).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  const to = (await page.locator(`[data-panel-empty-cell-id="empty:p0:${col}:${row}"]`).boundingBox())!;
  await page.mouse.move(to.x + from.width / 2, to.y + from.height / 2, { steps: 16 });
  await expect(page.locator(`[data-panel-drop-target="${col}:${row}"]`)).toBeVisible();
  await page.mouse.up();
}

test('clipped widgets show below and return when the window widens', async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1100 });
  await mockService(page);
  await page.goto('/system/dashboard');
  await cell(page, 'w-d').waitFor({ timeout: 15_000 });
  await expect.poll(() => columns(page)).toBe(16);
  await expectShownAt(page, 'w-d', 12, 0);

  await page.setViewportSize({ width: 1500, height: 1100 });
  await expect.poll(() => columns(page)).toBeLessThan(16);
  await expectShownAt(page, 'w-a', 0, 0);
  await expectShownAt(page, 'w-c', 8, 0);
  await expectShownAt(page, 'w-d', 0, 4);
  await expect(cell(page, 'w-d')).toBeInViewport({ ratio: 1 });

  // A resize writes nothing, so widening shows the stored cell again.
  await page.setViewportSize({ width: 2400, height: 1100 });
  await expect.poll(() => columns(page)).toBe(16);
  await expectShownAt(page, 'w-d', 12, 0);
});

test('a drop beside a moved-down widget leaves it in place and keeps its stored cell', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  const saved = await mockService(page);
  await page.goto('/system/dashboard');
  await cell(page, 'w-d').waitFor({ timeout: 15_000 });
  await expect.poll(() => columns(page)).toBeLessThan(16);
  await expectShownAt(page, 'w-d', 0, 4);

  await drag(page, 'w-a', 4, 4);
  await expect.poll(() => saved.length).toBe(1);
  expect(stored(saved, 'w-a')).toEqual([4, 4]);
  expect(stored(saved, 'w-d')).toEqual([12, 0]);
  await expectShownAt(page, 'w-a', 4, 4);
  await expectShownAt(page, 'w-d', 0, 4);

  // Moving w-d itself stores its new cell.
  await drag(page, 'w-d', 0, 0);
  await expect.poll(() => saved.length).toBe(2);
  expect(stored(saved, 'w-d')).toEqual([0, 0]);
});
