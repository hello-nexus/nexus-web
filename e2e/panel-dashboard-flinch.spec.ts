// Regression for the dashboard widget-drag "flinch": when a drop displaces a
// sibling and a second drag follows, the committed (col,row) lands in the same
// paint the make-room transform is still animating back to 0, so the cell's
// base jumps to its new slot while the stale transform carries it past the
// cell, then it slides back (overshoot). Fixed by clearing previewLayout in the
// drop batch and snapping the transform (transition 'none') once the drag ends.
//
// Repro: a tall 4x4 sits below two stacked 4x2s, with a 4x4 anchor pinning the
// right half so the cascade is forced vertical. Drag the tall one to the top
// (displacing both 4x2s down), release, then immediately drag it back down. The
// displaced w-a is committed to row 0 mid-gesture; without the fix its top
// overshoots far above the grid (negative) before settling.

import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 960 } });

const DASH_LAYOUT = {
  layoutSchemaVersion: 2,
  surface: 'desktop',
  pages: [
    {
      id: 'p0',
      widgets: [
        { id: 'w-pin', type: 'clock', size: '4x4', col: 4, row: 0 },
        { id: 'w-a', type: 'clock', size: '4x2', col: 0, row: 0 },
        { id: 'w-b', type: 'clock', size: '4x2', col: 0, row: 2 },
        { id: 'w-c', type: 'clock', size: '4x4', col: 0, row: 4 },
      ],
    },
  ],
};

async function mockService(page: Page) {
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
  // Accept the LAN /ws so the surface comes online (activeTransport=lan) and the
  // dashboard layout fetch isn't gated behind a doomed localhost socket.
  await page.routeWebSocket(/\/ws(\?|$)/, ws => { void ws; });
  await page.route('http://localhost:9400/**', async route => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/ping') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }) });
    if (p === '/pair') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) });
    if (p === '/profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' }) });
    if (p === '/preferences') {
      if (route.request().method() === 'POST') {
        preferences = { ...preferences, ...(route.request().postDataJSON() as Record<string, unknown>) };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false, msg: 'ok' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preferences) });
    }
    if (p === '/cooling/status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ calibrating: false, calibrationState: 'idle', activeCurves: 0, fanCount: 0, manualFans: 0, activeCurveFanCount: 0 }) });
    if (p === '/lighting/status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ effect: '', running: false, scanning: false }) });
    if (p === '/panel/status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ msg: 'stopped', kioskRunning: false, phoneConnected: false, phoneSubscribers: 0 }) });
    return route.fulfill({ status: 404, body: '' });
  });
}

async function center(page: Page, id: string) {
  const b = (await page.locator(`[data-surface="desktop"] [data-panel-widget-id="${id}"]`).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('dashboard drag does not overshoot displaced widgets off-grid (flinch)', async ({ page }) => {
  await mockService(page);
  await page.goto('/system/dashboard');
  await page.locator('[data-surface="desktop"] [data-panel-widget-id="w-c"]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);

  // w-a's only legitimate vertical slots are row 0 (its home) and the cascaded
  // row 4, both at positive `top`. The flinch drives it to a negative top
  // (above the grid) for a frame. Record its top across the whole gesture.
  await page.evaluate(() => {
    (window as unknown as { __min: number }).__min = Infinity;
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector('[data-surface="desktop"] [data-panel-widget-id="w-a"]') as HTMLElement | null;
      if (el) {
        const top = el.getBoundingClientRect().top;
        const w = window as unknown as { __min: number };
        if (top < w.__min) w.__min = top;
      }
      if (performance.now() - start < 5000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const drag = async (fx: number, fy: number, tx: number, ty: number, holdMs: number) => {
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(fx + (tx - fx) * (i / 16), fy + (ty - fy) * (i / 16));
      await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, holdMs));
    await page.mouse.up();
  };

  const from = await center(page, 'w-c');
  const to = await center(page, 'w-a');
  // Drag #1: tall widget to the top (pushes w-a + w-b down). Release.
  await drag(from.x, from.y, to.x, to.y, 150);
  // Drag #2 right after: drag it back down. w-a is committed to row 0 mid-drag;
  // the stale make-room transform must not overshoot it off-grid.
  await new Promise(r => setTimeout(r, 60));
  const c2 = await center(page, 'w-c');
  await drag(c2.x, c2.y, c2.x, c2.y + 400, 400);
  await page.waitForTimeout(800);

  const minTop = await page.evaluate(() => (window as unknown as { __min: number }).__min);
  // Allow sub-pixel rounding around row 0 (top ~153); a flinch sends it
  // hundreds of px negative.
  expect(minTop, `w-a overshot to top=${minTop.toFixed(0)} (drag flinch)`).toBeGreaterThan(120);
});
