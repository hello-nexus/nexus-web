// Drives the immersive-on-load mark on /panel in a real browser: a widget the
// layout names opens its immersive view as the panel loads, the dashboard never
// paints behind it, and a swipe down still hands the user back to the dashboard.
// The bare-dashboard check is the point of doing this in a browser at all - a
// unit test on the gate cannot see the frame an effect-driven open would leak.

import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

const DEVICE_ID = 'panel-immersive-on-load-spec';
const WIDGET_ID = 'w-media-on-load';

// 'media' declares an immersive view in both orientations, so the mark is live
// on this portrait phone viewport.
function seedRecord(immersiveOnLoadWidgetId?: string) {
  return {
    id: DEVICE_ID,
    displayName: 'immersive-on-load spec',
    capabilities: { surface: 'phone', touch: true },
    layout: {
      layoutSchemaVersion: 2,
      surface: 'phone',
      pages: [{
        id: 'p1',
        widgets: [
          { id: WIDGET_ID, type: 'media', size: '4x2', col: 0, row: 0 },
          { id: 'w-clock', type: 'clock', size: '4x2', col: 0, row: 2 },
        ],
      }],
      immersiveOnLoadWidgetId,
    },
  };
}

// Every immersiveOnLoadWidgetId the panel has PATCHed, newest last.
let patchedMarks: (string | null)[] = [];

async function gotoPanel(page: Page, record: object) {
  patchedMarks = [];
  await page.addInitScript(() => {
    class NoopChannel {
      name: string;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      constructor(name: string) { this.name = name; }
      postMessage() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    (window as unknown as { BroadcastChannel: typeof NoopChannel }).BroadcastChannel = NoopChannel;
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
    }
    // Counts FRAMES in which the dashboard would be VISIBLE - widget cells laid
    // out with no immersive overlay actually covering them. Presence of the
    // overlay element is not enough: its enter keyframe starts at
    // translateY(100%)/opacity 0, so a slid-in open leaves the dashboard on
    // screen for the whole animation while the dialog is already in the DOM.
    // Sampled from rAF, which runs after the commit and before the paint it
    // belongs to, so each count is a frame the user would have seen.
    const w = window as unknown as { __bareDashboard: number };
    w.__bareDashboard = 0;
    const covered = () => {
      const overlay = document.querySelector('[role="dialog"]');
      if (!(overlay instanceof HTMLElement)) return false;
      const cs = getComputedStyle(overlay);
      if (Number(cs.opacity) < 0.99) return false;
      const rect = overlay.getBoundingClientRect();
      return rect.top <= 1 && rect.bottom >= window.innerHeight - 1;
    };
    const sample = () => {
      if (document.querySelector('[data-panel-widget-id]') && !covered()) {
        w.__bareDashboard += 1;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/panel/devices/**', route => {
    const request = route.request();
    if (request.method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) });
      return;
    }
    try {
      const body = request.postDataJSON() as { layout?: { immersiveOnLoadWidgetId?: string } };
      if (body?.layout) patchedMarks.push(body.layout.immersiveOnLoadWidgetId ?? null);
    } catch {
      // Non-layout PATCH (capabilities report); nothing to record.
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('**/preferences', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/pair', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/ping', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }),
  }));
  // A real panel serves install defaults, so the layout usePanelLayout holds
  // before it hydrates is a POPULATED seed, not an empty one. Stubbing this 404
  // would make the pre-hydration commit render zero cells and hide the very
  // dashboard flash these tests are here to catch.
  await page.route('**/defaults', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      panel: {
        layouts: {
          phone: {
            layoutSchemaVersion: 2,
            surface: 'phone',
            widgets: [
              { type: 'monitoring', size: '4x2', col: 0, row: 0 },
              { type: 'lighting', size: '4x2', col: 0, row: 2 },
              { type: 'cooling', size: '4x2', col: 0, row: 4 },
            ],
          },
        },
      },
    }),
  }));
  await page.goto(`/panel/${DEVICE_ID}`);
}

// Swipe down inside the overlay, the gesture usePanelSheetSwipe dismisses on.
async function swipeDown(page: Page, fromX: number, fromY: number) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: fromX, y: fromY, id: 1 }],
    });
    for (let i = 1; i <= 16; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: fromX, y: fromY + i * 40, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 20));
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await client.detach();
  }
}

// Long-press a cell to raise its context menu, the kiosk's route into the
// widget's edit options.
async function longPress(page: Page, x: number, y: number) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await new Promise(r => setTimeout(r, 600));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await client.detach();
  }
}

test.describe('panel immersive on load', () => {
  test('opens the marked widget immersive without flashing the dashboard', async ({ page }) => {
    await gotoPanel(page, seedRecord(WIDGET_ID));

    const overlay = page.getByRole('button', { name: 'Close immersive view' });
    await overlay.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);

    // The grid is mounted underneath (exit has to land back on it), so the
    // claim under test is that it was never uncovered, not that it is absent.
    await expect(page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`)).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __bareDashboard: number }).__bareDashboard))
      .toBe(0);
  });

  test('a swipe down hands the dashboard back, and it stays back', async ({ page }) => {
    await gotoPanel(page, seedRecord(WIDGET_ID));
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 15_000 });
    await expect(dialog).toHaveAttribute('data-entered', 'true');

    // Start above the immersive view's own controls: usePanelSheetSwipe skips
    // arming on a control target, so a drag begun on one scrolls nothing and
    // leaves the overlay open (correct product behaviour, not a dismiss path).
    await swipeDown(page, 206, 120);
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    // The open latches once per load: nothing re-opens it behind the user.
    await page.waitForTimeout(1_000);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`)).toBeVisible();
  });

  test('an unmarked layout loads on the dashboard as before', async ({ page }) => {
    await gotoPanel(page, seedRecord(undefined));
    await page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('a mark naming a widget on a later page is inert', async ({ page }) => {
    const record = seedRecord('w-second-page');
    (record.layout.pages as unknown[]).push({
      id: 'p2',
      widgets: [{ id: 'w-second-page', type: 'media', size: '4x2', col: 0, row: 0 }],
    });
    await gotoPanel(page, record);
    await page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('the on-device edit options carry the toggle, and turning it off persists', async ({ page }) => {
    await gotoPanel(page, seedRecord(WIDGET_ID));
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Close immersive view' }).tap();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    const cellBox = (await page.locator(`[data-panel-widget-id="${WIDGET_ID}"]`).boundingBox())!;
    await longPress(page, cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
    // The press arms dnd-kit's drag at the same instant the menu opens, so let
    // the release settle before clicking through the menu.
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Edit' }).click();

    const toggle = page.getByRole('switch', { name: 'Immersive on load' });
    await toggle.waitFor({ timeout: 5_000 });
    await expect(toggle).toBeChecked();

    await toggle.tap();
    await expect(toggle).not.toBeChecked();
    // The layout write is debounced, so wait for the PATCH rather than the tap.
    await expect.poll(() => patchedMarks.at(-1), { timeout: 5_000 }).toBeNull();
  });
});
