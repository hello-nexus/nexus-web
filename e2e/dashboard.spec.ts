import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 1440, height: 960 },
});

async function mockService(page: Page, savedPreferencePatches: unknown[]) {
  let preferences: Record<string, unknown> = {
    language: 'en',
    themeMode: 'system',
    accentColor: '#22c55e',
    disableConflictAlerts: false,
    monitoringShowAverage: true,
    monitoringDetailedCollapsed: [],
    showMacStatusBarIcon: true,
    showWindowsTrayIcon: true,
  };

  await page.addInitScript(() => {
    localStorage.setItem('qos_token', 'test-token');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('http://localhost:9400/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/ping') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ service: 'qos', version: 'test', initialized: true, platform: 'macos' }),
      });
      return;
    }
    if (path === '/pair') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) });
      return;
    }
    if (path === '/profiles') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }],
          activeId: 'default',
        }),
      });
      return;
    }
    if (path === '/preferences') {
      if (request.method() === 'POST') {
        const patch = request.postDataJSON();
        preferences = { ...preferences, ...patch };
        savedPreferencePatches.push(patch);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false, msg: 'ok' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preferences) });
      return;
    }
    if (path === '/cooling/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          calibrating: false,
          calibrationState: 'idle',
          activeCurves: 0,
          fanCount: 0,
          manualFans: 0,
          activeCurveFanCount: 0,
        }),
      });
      return;
    }
    if (path === '/lighting/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ effect: '', running: false, scanning: false }) });
      return;
    }
    if (path === '/panel/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ msg: 'stopped', kioskRunning: false, phoneConnected: false, phoneSubscribers: 0 }),
      });
      return;
    }
    if (path === '/system/memory/total') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ msg: '32 GB' }) });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

async function activeWidgetIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));
    const activePage = pages.find(p => p.getAttribute('aria-hidden') === 'false') ?? pages[0];
    if (!activePage) return [];
    return Array.from(activePage.querySelectorAll<HTMLElement>('[data-panel-widget-id]'))
      .map(el => el.getAttribute('data-panel-widget-id') || '')
      .filter(Boolean);
  });
}

async function widgetCenterById(page: Page, id: string) {
  const locator = page.locator(`[data-panel-widget-id="${id}"]`).first();
  await locator.waitFor({ state: 'attached', timeout: 5_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps),
    );
  }
  await page.mouse.up();
}

async function dashboardAccentState(page: Page) {
  return page.evaluate(() => {
    const rootAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const probe = document.createElement('span');
    probe.style.color = rootAccent;
    document.body.appendChild(probe);
    const accentColor = getComputedStyle(probe).color;
    probe.remove();
    const active = document.querySelector<HTMLElement>('[data-surface="desktop"] [aria-pressed="true"]');
    return {
      accentColor,
      activeBorder: active ? getComputedStyle(active).borderTopColor : '',
    };
  });
}

async function dashboardGridState(page: Page) {
  return page.evaluate(() => {
    const firstWidget = document.querySelector<HTMLElement>('[data-surface="desktop"] [data-panel-widget-id]');
    const root = firstWidget?.closest<HTMLElement>('[data-surface="desktop"]');
    const activePage = firstWidget?.closest<HTMLElement>('[data-panel-page-index]');
    const grid = firstWidget?.parentElement;
    if (!root || !activePage || !grid || !firstWidget) return null;
    const rootStyle = getComputedStyle(root);
    const gridRect = grid.getBoundingClientRect();
    const pageRect = activePage.getBoundingClientRect();
    const firstWidgetRect = firstWidget.getBoundingClientRect();
    return {
      cellSize: Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size')),
      contentScale: Number.parseFloat(rootStyle.getPropertyValue('--panel-content-scale')),
      gridLeft: Math.round(gridRect.left),
      gridWidth: Math.round(gridRect.width),
      pageLeft: Math.round(pageRect.left),
      pageWidth: Math.round(pageRect.width),
      firstWidgetLeft: Math.round(firstWidgetRect.left),
    };
  });
}

test('dashboard seeds panel widgets, adds a widget, and supports mouse drag reorder', async ({ page }) => {
  const savedPreferencePatches: unknown[] = [];
  await mockService(page, savedPreferencePatches);

  await page.goto('/my-computer/dashboard');
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });

  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveClass(/active/);
  await expect(page.locator('[data-surface="desktop"]')).toBeVisible();
  await expect(page.locator('[data-panel-widget-id]')).toHaveCount(3);
  await expect.poll(() => dashboardAccentState(page)).toEqual({
    accentColor: 'rgb(34, 197, 94)',
    activeBorder: 'rgb(34, 197, 94)',
  });
  await expect.poll(() => dashboardGridState(page)).toMatchObject({
    cellSize: 90,
    contentScale: 90,
  });
  const gridState = await dashboardGridState(page);
  expect(gridState).not.toBeNull();
  expect(gridState!.gridLeft - gridState!.pageLeft).toBe(16);
  expect(gridState!.firstWidgetLeft).toBe(gridState!.gridLeft);
  expect(gridState!.gridWidth).toBeLessThan(gridState!.pageWidth);

  await page.getByRole('button', { name: /add widget/i }).click();
  await page.getByRole('button', { name: 'Clock' }).click();
  await expect(page.locator('[data-panel-widget-id]')).toHaveCount(4);
  await expect.poll(() => savedPreferencePatches.length).toBeGreaterThan(0);
  expect(savedPreferencePatches.some(patch =>
    Boolean((patch as { dashboardLayout?: unknown }).dashboardLayout),
  )).toBe(true);

  const before = await activeWidgetIds(page);
  expect(before.length).toBeGreaterThanOrEqual(2);
  const first = await widgetCenterById(page, before[0]);
  const second = await widgetCenterById(page, before[1]);

  await mouseDrag(page, first, second);
  await page.waitForTimeout(500);

  const after = await activeWidgetIds(page);
  expect(after).toContain(before[0]);
  expect(after).toContain(before[1]);
  expect(after.indexOf(before[0])).toBeGreaterThan(after.indexOf(before[1]));
});

test('dashboard edit drawer keeps the active widget visible beside the sheet', async ({ page }) => {
  const savedPreferencePatches: unknown[] = [];
  await mockService(page, savedPreferencePatches);

  await page.goto('/my-computer/dashboard');
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });

  const ids = await activeWidgetIds(page);
  const editableId = ids[2];
  expect(editableId).toBeTruthy();

  const widget = page.locator(`[data-panel-widget-id="${editableId}"]`).first();
  const widgetCenter = await widgetCenterById(page, editableId);
  await widget.dispatchEvent('contextmenu', {
    clientX: widgetCenter.x,
    clientY: widgetCenter.y,
    button: 2,
    bubbles: true,
    cancelable: true,
  });
  await page.getByRole('button', { name: 'Edit' }).evaluate((button: HTMLButtonElement) => button.click());

  const sheet = page.locator('aside:has(button[aria-label="Close"])');
  await expect(sheet).toBeVisible();

  await expect.poll(async () => {
    const widgetBox = await widget.boundingBox();
    const sheetBox = await sheet.boundingBox();
    if (!widgetBox || !sheetBox) return false;
    const center = {
      x: widgetBox.x + widgetBox.width / 2,
      y: widgetBox.y + widgetBox.height / 2,
    };
    const focusedWidgetOwnsCenter = await page.evaluate(({ id, x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest(`[data-panel-widget-id="${id}"]`) !== null;
    }, { id: editableId, ...center });
    return focusedWidgetOwnsCenter && widgetBox.x + widgetBox.width < sheetBox.x - 8;
  }, { timeout: 5_000 }).toBe(true);
});
