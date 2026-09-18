// Drives the panel widget drag-and-drop on /panel via touch events,
// simulating an iPhone. Verifies that:
//   1. The default layout renders in flat order with widget cells
//      placed row-major and no backfill.
//   2. A long-press then drag reorders widgets in flat order.
//   3. The committed order matches what the projected-layout strategy
//      previewed during the drag.
//
// The panel is loaded with a stable test deviceId. The backend panel
// API is not running in this test so fetchPanelDevice returns the SPA
// shell which rejects in .json(); the PanelApp falls back to the
// default phone layout in local React state. That is enough to verify
// the iOS-style drag semantics.

import { test, expect, type Page } from '@playwright/test';
import { PANEL_EDGE_ADVANCE_DWELL_MS } from '../src/panel/engine/dragConstants';

// iPhone-shaped viewport on Chromium. We do not use devices['iPhone 14']
// because that profile requests WebKit, which is not installed in this
// project's Playwright config (chromium-only). The runtime behavior we
// care about - touch events + iOS-style drag - is fully exercised on
// Chromium with hasTouch + isMobile + a phone-sized viewport.
test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

const DEVICE_ID = 'panel-drag-spec';

async function gotoPanel(page: Page, seedRecord?: object) {
  // Disable the BroadcastChannel "layout changed" hand-off before any
  // app code runs. Without this, every PATCH that the panel writes
  // (which the static server resolves to a 404 here) still triggers a
  // local re-fetch via BroadcastChannel. The re-fetch resolves null
  // -> defaultLayoutForSurface() -> FRESH uuids -> the dragged
  // widget's id we read pre-drag no longer exists in the DOM. With
  // the channel stubbed, the panel's optimistic local layout state
  // survives between drag-end and our post-drop assertion.
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
    // Service worker would otherwise serve stale assets from a prior
    // run, defeating CSS / TS edits made between test runs.
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
  });
  // Block sw.js explicitly so registration paths fail.
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  // Block the panel device REST endpoints so the SPA's static-server
  // catchall does not return index.html with 200 OK (which then crashes
  // .json() inside fetchService). With an explicit 404, fetchService
  // resolves to null and the panel uses its in-memory default layout.
  if (!seedRecord) {
    await page.route('**/panel/devices/**', route => route.fulfill({ status: 404, body: '' }));
  } else {
    await page.route('**/panel/devices/**', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(seedRecord),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      }
    });
  }
  await page.route('**/preferences', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/pair', route => route.fulfill({ status: 404, body: '' }));
  // Pretend the local service is online so PanelOfflineOverlay does
  // not cover the panel - the overlay's `pointer-events: auto`
  // intercepts all drag gestures, making the surface untestable.
  await page.route('**/ping', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }),
  }));
  // defaultLayoutForSurface reads the install-defaults cache (GET
  // /defaults at bootstrap); without this stub the "default phone
  // layout" is EMPTY and every unseeded test sees zero widgets. Shape
  // mirrors nexus-service/data/install-defaults.json panel.layouts.phone.
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
  // Wait for the load + first paint of widgets, then settle so the
  // serviceStatus state machine and any post-mount re-renders complete.
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });
  // Layout fields can briefly be replaced by the fetch path (see
  // usePanelLayout.fetchLayout). Wait for the post-fetch settle so
  // the uuid set we read here matches the post-drag uuid set.
  await page.waitForTimeout(800);
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

async function widgetRectById(page: Page, id: string) {
  // Prefer locator: it polls until the element is attached and gives
  // a stable bounding box even if dnd-kit applies a transform between
  // ticks.
  const locator = page.locator(`[data-panel-widget-id="${id}"]`);
  await locator.first().waitFor({ state: 'attached', timeout: 5_000 });
  const box = await locator.first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${id}`);
  return box;
}

async function widgetCenterById(page: Page, id: string) {
  const r = await widgetRectById(page, id);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

// CDP touch driver. Runs in the browser's input pipeline so dnd-kit's
// PointerSensor sees actual pointerdown/move/up events with real
// pointer state (capture, primary, etc.) - synthesized PointerEvents
// dispatched from page.evaluate() lose enough state that dnd-kit's
// delay activation does not fire.
async function longPressDrag(page: Page, fromX: number, fromY: number, toX: number, toY: number) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: fromX, y: fromY, id: 1 }],
    });
    // Long-press past the activation delay (360 ms in
    // usePanelTouchMode.PANEL_CONTEXT_MENU_TRIGGER_MS). 500 ms gives
    // dnd-kit's DelayedActivationConstraint comfortably enough time
    // to fire onDragStart.
    await new Promise(r => setTimeout(r, 500));
    const STEPS = 14;
    for (let i = 1; i <= STEPS; i++) {
      const x = fromX + (toX - fromX) * (i / STEPS);
      const y = fromY + (toY - fromY) * (i / STEPS);
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 30));
    }
    await new Promise(r => setTimeout(r, 120));
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await client.detach();
  }
}

test.describe('panel widget drag (iOS-style)', () => {
  test('renders default phone layout with widgets', async ({ page }) => {
    await gotoPanel(page);
    const ids = await activeWidgetIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // Each id is uniquely findable - no duplicates from dock or
    // overlay.
    for (const id of ids) {
      const count = await page.locator(`[data-panel-widget-id="${id}"]`).count();
      expect(count, `unique ${id}`).toBe(1);
    }
  });

  test('row-major placement: each widget sits BELOW the previous one (no dense backfill)', async ({ page }) => {
    await gotoPanel(page);
    const ids = await activeWidgetIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(3);

    const rects = await Promise.all(ids.map(id => widgetRectById(page, id)));
    // For each consecutive pair, the second widget's top must be at
    // or below the first widget's top. With grid-auto-flow: dense, a
    // smaller later widget could float ABOVE an earlier larger one
    // (dense backfill). iOS forbids that and so do we.
    for (let i = 1; i < rects.length; i++) {
      const prev = rects[i - 1];
      const curr = rects[i];
      // Allow tiny pixel rounding by relaxing the comparison by 2px.
      expect(curr.y).toBeGreaterThanOrEqual(prev.y - 2);
    }
  });

  test('no two visible widgets overlap', async ({ page }) => {
    await gotoPanel(page);
    const ids = await activeWidgetIds(page);
    const rects = await Promise.all(ids.map(id => widgetRectById(page, id)));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapsX = a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2;
        const overlapsY = a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2;
        expect(overlapsX && overlapsY, `widgets ${ids[i]} and ${ids[j]} overlap`).toBe(false);
      }
    }
  });

  test('long-press + drag reorders widgets in flat order', async ({ page }) => {
    await gotoPanel(page);
    const before = await activeWidgetIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const fromId = before[0];
    const toId = before[1];

    const fromCenter = await widgetCenterById(page, fromId);
    const toCenter = await widgetCenterById(page, toId);

    await longPressDrag(page, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    await page.waitForTimeout(600);

    const after = await activeWidgetIds(page);
    expect(after).toContain(fromId);
    expect(after).toContain(toId);
    // The dragged widget moved past the over-target in flat order.
    const fromAfter = after.indexOf(fromId);
    const toAfter = after.indexOf(toId);
    expect(fromAfter).toBeGreaterThan(toAfter);

    // Trailing widgets keep their relative order.
    if (before.length >= 3) {
      const tailBefore = before.slice(2);
      const tailAfter = after.filter(id => tailBefore.includes(id));
      expect(tailAfter).toEqual(tailBefore);
    }
  });

  test('drag from index 1 to index 0 lands the widget at the head', async ({ page }) => {
    await gotoPanel(page);
    const before = await activeWidgetIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    // Drag the second widget UP to the first widget's slot.
    const fromCenter = await widgetCenterById(page, before[1]);
    const toCenter = await widgetCenterById(page, before[0]);
    await longPressDrag(page, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    await page.waitForTimeout(600);

    const after = await activeWidgetIds(page);
    // The dragged widget is now at index 0.
    expect(after[0]).toBe(before[1]);
    // The displaced widget (formerly at index 0) shifts to index 1.
    expect(after[1]).toBe(before[0]);
  });

  test('dragging out and back to the source slot drops in place (no reorder)', async ({ page }) => {
    await gotoPanel(page);
    const before = await activeWidgetIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const fromId = before[0];
    const fromCenter = await widgetCenterById(page, fromId);
    const toCenter = await widgetCenterById(page, before[1]);

    // Long-press + drag down to the next slot, then drag back to the
    // original slot, then release. iOS drops the widget where it
    // started; our system must too. Verifies that the displaced
    // neighbour snaps home when the cursor returns to the source.
    await page.evaluate(async ([sx, sy, mx, my]) => {
      // We rely on the same CDP-based touch we use for the basic
      // drag, but split into out + back legs by chaining touchMove
      // events ourselves.
      void sx; void sy; void mx; void my;
    }, [fromCenter.x, fromCenter.y, toCenter.x, toCenter.y]);

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fromCenter.x, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 500));
      // Out leg
      const stepCount = 10;
      for (let i = 1; i <= stepCount; i++) {
        const x = fromCenter.x + (toCenter.x - fromCenter.x) * (i / stepCount);
        const y = fromCenter.y + (toCenter.y - fromCenter.y) * (i / stepCount);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 100));
      // Back leg
      for (let i = 1; i <= stepCount; i++) {
        const x = toCenter.x + (fromCenter.x - toCenter.x) * (i / stepCount);
        const y = toCenter.y + (fromCenter.y - toCenter.y) * (i / stepCount);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 120));
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
    await page.waitForTimeout(600);

    const after = await activeWidgetIds(page);
    // The flat order is identical: nothing was committed because the
    // user dropped where they started.
    expect(after).toEqual(before);
  });

  test('widget scroll panes still pan despite cell touch-action: none', async ({ page }) => {
    // Seed a phone layout with the EmojiWidget so we have a guaranteed
    // [data-panel-scrollable] pane; the default phone layout's
    // scrollable widgets only render their pane when backend data
    // resolves a non-empty mode (lighting-quick gates the carousel
    // behind mode === 'animate'), which we can't drive without a
    // service.
    await gotoPanel(page, {
      id: DEVICE_ID,
      displayName: 'Test',
      firstSeenAt: 0,
      lastSeenAt: 0,
      capabilities: { surface: 'phone' },
      layout: {
        layoutSchemaVersion: 2,
        surface: 'phone',
        pages: [
          {
            id: 'page-emoji',
            widgets: [
              { id: 'w-emoji', type: 'emoji', size: '4x4', col: 0, row: 0 },
            ],
          },
        ],
      },
    });
    const result = await page.evaluate(() => {
      const pane = document.querySelector('[data-panel-scrollable="true"]');
      if (!pane) return { found: false };
      const chain: { tag: string; touchAction: string; isScrollPane: boolean }[] = [];
      let node: Element | null = pane;
      while (node && node !== document.documentElement) {
        const ta = getComputedStyle(node).touchAction;
        const cls = ((node as HTMLElement).className || '').toString();
        chain.push({
          tag: node.tagName.toLowerCase() + (cls ? '.' + cls.slice(0, 50) : ''),
          touchAction: ta,
          isScrollPane: node === pane,
        });
        node = node.parentElement;
      }
      return { found: true, chain };
    });
    expect(result.found, 'EmojiWidget should expose a [data-panel-scrollable] pane').toBe(true);

    // Try to scroll the pane via a real touch-pan and assert the pane
    // moved. Browsers sometimes implement touch-action's chain rule
    // with a "scroll container boundary" so an overflow:auto descendant
    // can pan-y even if an ancestor declares none. This test is the
    // empirical ground truth.
    const beforeTop = await page.$eval('[data-panel-scrollable="true"]', el => el.scrollTop);
    const box = await page.locator('[data-panel-scrollable="true"]').first().boundingBox();
    if (!box) throw new Error('no bounding box for scroll pane');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height * 0.7;
    const endY = box.y + box.height * 0.2;

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY, id: 1 }],
      });
      const STEPS = 12;
      for (let i = 1; i <= STEPS; i++) {
        const y = startY + (endY - startY) * (i / STEPS);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX, y, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 16));
      }
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
    await page.waitForTimeout(400);

    const afterTop = await page.$eval('[data-panel-scrollable="true"]', el => el.scrollTop);
    expect(afterTop, `scroll pane did not pan; ancestors block touch-action chain: ${JSON.stringify(result.chain)}`).toBeGreaterThan(beforeTop);
  });

  test('edge-advance latches: dwelling at the edge only flips ONE page per leave-and-re-enter', async ({ page }) => {
    // Seed three pages of large widgets so we can drag a widget on
    // page 0 and verify the pager advances exactly one page even when
    // the cursor sits at the edge for multiple dwell intervals.
    await gotoPanel(page, {
      id: DEVICE_ID,
      displayName: 'Test',
      firstSeenAt: 0,
      lastSeenAt: 0,
      capabilities: { surface: 'phone' },
      layout: {
        layoutSchemaVersion: 2,
        surface: 'phone',
        pages: [
          {
            id: 'p0',
            widgets: [
              { id: 'p0-w1', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p0-w2', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
          {
            id: 'p1',
            widgets: [
              { id: 'p1-w1', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p1-w2', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
          {
            id: 'p2',
            widgets: [
              { id: 'p2-w1', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p2-w2', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
        ],
      },
    });

    const activeIdxOf = async () =>
      page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));
        const active = pages.findIndex(p => p.getAttribute('aria-hidden') === 'false');
        return active;
      });

    expect(await activeIdxOf()).toBe(0);

    // Long-press a widget on page 0, drag to the right edge, dwell.
    const fromCenter = await widgetCenterById(page, 'p0-w1');
    const viewport = page.viewportSize()!;
    const targetX = viewport.width - 16;
    const targetY = fromCenter.y;

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fromCenter.x, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 500)); // long-press
      // Glide to the right edge in steps, then HOLD for >2 dwell
      // intervals (EDGE_ADVANCE_DWELL_MS = 600 in PanelApp.tsx).
      const STEPS = 12;
      for (let i = 1; i <= STEPS; i++) {
        const x = fromCenter.x + (targetX - fromCenter.x) * (i / STEPS);
        const y = fromCenter.y + (targetY - fromCenter.y) * (i / STEPS);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 30));
      }
      // Sit at the edge for ~2.5 dwell intervals. Without the latch,
      // the pager would advance twice (page 0 -> 1 -> 2). With the
      // latch, it advances exactly once (page 0 -> 1) and stays
      // there until the user moves out and back into the edge.
      await new Promise(r => setTimeout(r, PANEL_EDGE_ADVANCE_DWELL_MS * 2.5));
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
    await page.waitForTimeout(400);

    const finalActive = await activeIdxOf();
    expect(finalActive, 'edge-advance must latch after one flip; not run away to page 2').toBe(1);
  });

  test('edge-advance triggers off the FINGER: full-width widget grabbed near its trailing edge still crosses pages', async ({ page }) => {
    // Regression: the edge bands used to test only the dragged RECT's
    // center. A full-width (4-col) widget grabbed near the edge the drag
    // heads for moves the rect center only as far as the finger's small
    // delta - the finger hits the screen edge while the center is still
    // mid-viewport, so the page never advanced.
    await gotoPanel(page, {
      id: DEVICE_ID,
      displayName: 'Test',
      firstSeenAt: 0,
      lastSeenAt: 0,
      capabilities: { surface: 'phone' },
      layout: {
        layoutSchemaVersion: 2,
        surface: 'phone',
        pages: [
          {
            id: 'p0',
            widgets: [
              { id: 'p0-w1', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p0-w2', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
          {
            id: 'p1',
            widgets: [
              { id: 'p1-w1', type: 'clock', size: '4x4', col: 0, row: 0 },
            ],
          },
        ],
      },
    });

    const activeIdxOf = async () =>
      page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));
        return pages.findIndex(p => p.getAttribute('aria-hidden') === 'false');
      });
    expect(await activeIdxOf()).toBe(0);

    // Grab close to the widget's right edge: the finger has only a few px
    // of travel left to the viewport edge, so the rect center barely moves.
    const box = await widgetRectById(page, 'p0-w1');
    const grabX = box.x + box.width - 24;
    const grabY = box.y + box.height / 2;
    const viewport = page.viewportSize()!;
    const targetX = viewport.width - 8;

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: grabX, y: grabY, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 500)); // long-press
      const STEPS = 8;
      for (let i = 1; i <= STEPS; i++) {
        const x = grabX + (targetX - grabX) * (i / STEPS);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: grabY, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, PANEL_EDGE_ADVANCE_DWELL_MS * 1.5));
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
    await page.waitForTimeout(400);

    expect(await activeIdxOf(), 'finger dwelling at the screen edge must advance the page even when the rect center is mid-viewport').toBe(1);
  });

  test('cross-page hover does not apply per-cell transforms (no shifted-left flicker)', async ({ page }) => {
    // Three pages, four widgets each. Drag a widget on page 0, edge-
    // advance to page 1, dwell on page 1 widget. We then read each
    // page-1 cell's computed transform: it must be `none` (or the
    // identity matrix). With the old projection the splice +
    // repaginate would pull the over-cell from page 1 back to page 0,
    // and the strategy would render that as a one-page-wide leftward
    // translate on the destination cells.
    await gotoPanel(page, {
      id: DEVICE_ID,
      displayName: 'Test',
      firstSeenAt: 0,
      lastSeenAt: 0,
      capabilities: { surface: 'phone' },
      layout: {
        layoutSchemaVersion: 2,
        surface: 'phone',
        pages: [
          {
            id: 'p0',
            widgets: [
              { id: 'p0-a', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p0-b', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
          {
            id: 'p1',
            widgets: [
              { id: 'p1-a', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p1-b', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
          {
            id: 'p2',
            widgets: [
              { id: 'p2-a', type: 'clock', size: '4x4', col: 0, row: 0 },
              { id: 'p2-b', type: 'clock', size: '4x4', col: 0, row: 4 },
            ],
          },
        ],
      },
    });

    const fromCenter = await widgetCenterById(page, 'p0-a');
    const viewport = page.viewportSize()!;

    const client = await page.context().newCDPSession(page);
    let page1TransformsDuringHover: string[] = [];
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fromCenter.x, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 500));
      // Drag to right edge
      const targetX = viewport.width - 16;
      const STEPS = 12;
      for (let i = 1; i <= STEPS; i++) {
        const x = fromCenter.x + (targetX - fromCenter.x) * (i / STEPS);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: fromCenter.y, id: 1 }],
        });
        await new Promise(r => setTimeout(r, 30));
      }
      // Dwell ~700ms: edge-advance fires (600ms) + transition lands.
      await new Promise(r => setTimeout(r, PANEL_EDGE_ADVANCE_DWELL_MS + 200));
      // Move into page 1 from the right edge so over latches on a
      // page 1 widget.
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: viewport.width / 2, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 200));

      // Read transforms on page 1 cells WHILE the hover is still
      // active (don't release yet).
      page1TransformsDuringHover = await page.evaluate(() => {
        const ids = ['p1-a', 'p1-b'];
        return ids.map(id => {
          const el = document.querySelector(`[data-panel-widget-id="${id}"]`);
          return el ? getComputedStyle(el).transform : 'missing';
        });
      });

      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }

    // Each page-1 cell must NOT carry a strategy translate during a
    // cross-page hover. The bug rendered a one-page-wide leftward
    // translate (hundreds of px); we accept up to 1px of sub-pixel
    // rounding, matching the strategy's own `Math.abs(dx) < 1`
    // early-return threshold.
    for (const tf of page1TransformsDuringHover) {
      if (tf === 'none' || tf === 'matrix(1, 0, 0, 1, 0, 0)') continue;
      const m = /matrix\(([^)]+)\)/.exec(tf);
      if (!m) {
        throw new Error(`page 1 cell carries non-matrix transform during cross-page hover: ${tf}`);
      }
      const parts = m[1].split(',').map(s => Number.parseFloat(s.trim()));
      const tx = parts[4] ?? 0;
      const ty = parts[5] ?? 0;
      expect(Math.abs(tx), `tx leak during cross-page hover: ${tf}`).toBeLessThan(1);
      expect(Math.abs(ty), `ty leak during cross-page hover: ${tf}`).toBeLessThan(1);
    }
  });

  test('sub-threshold movement after long-press does NOT lift the cell', async ({ page }) => {
    await gotoPanel(page);
    const before = await activeWidgetIds(page);
    expect(before.length).toBeGreaterThanOrEqual(1);
    const fromId = before[0];
    const fromCenter = await widgetCenterById(page, fromId);

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fromCenter.x, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 500)); // long-press, menu opens
      // Move 6px - well below the 12px PANEL_DRAG_START_THRESHOLD_PX.
      // dnd-kit fires onDragMove on every pointer move, but the panel
      // must NOT promote the staged snapshot to activeDragId because
      // the threshold has not been crossed.
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: fromCenter.x + 6, y: fromCenter.y, id: 1 }],
      });
      await new Promise(r => setTimeout(r, 80));

      // Source cell must still be visible (opacity > 0). When the
      // drag lifts, .cellDragSource sets opacity: 0 - we test for
      // that below the threshold, the cell is still painted.
      const sourceOpacity = await page.evaluate(id => {
        const el = document.querySelector(`[data-panel-widget-id="${id}"]`);
        return el ? Number.parseFloat(getComputedStyle(el).opacity) : -1;
      }, fromId);
      expect(sourceOpacity, 'source cell lifted before threshold crossed').toBeGreaterThan(0.1);

      // The DragOverlay clone (portaled to body, marked .dragOverlayHost)
      // must NOT be in the DOM - dnd-kit only renders it when
      // activeDragId is set.
      const hasOverlayClone = await page.evaluate(() =>
        document.body.querySelector('[class*="dragOverlayHost"]') !== null);
      expect(hasOverlayClone, 'drag overlay clone rendered before threshold crossed').toBe(false);

      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
  });

  // A full 4x16 column (the Y70 shape, on a phone viewport tall enough for
  // 16 rows): a 4x2 between three 4x4s can only move by shifting the stack,
  // since no displaced 4x4 ever finds a contiguous 4-row hole.
  test.describe('full column shift', () => {
    test.use({ viewport: { width: 412, height: 1700 } });

    const fullColumn = (order: Array<[string, string, '4x2' | '4x4', number]>) => ({
      id: DEVICE_ID,
      displayName: 'Test',
      firstSeenAt: 0,
      lastSeenAt: 0,
      capabilities: { surface: 'phone' },
      layout: {
        layoutSchemaVersion: 2,
        surface: 'phone',
        pages: [{
          id: 'page-full',
          widgets: order.map(([id, type, size, row]) => ({ id, type, size, col: 0, row })),
        }],
      },
    });

    async function cellRows(page: Page): Promise<Record<string, number>> {
      return page.evaluate(() => Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLElement>('[data-panel-widget-id]'))
          .map(el => [el.dataset.panelWidgetId ?? '', Number(el.dataset.panelCellRow)]),
      ));
    }

    async function gridRows(page: Page): Promise<number> {
      return page.evaluate(() => Number(
        document.querySelector<HTMLElement>('.panel-root')?.style.getPropertyValue('--panel-rows')));
    }

    // Finger travel per grid row, from two rendered cells of known spans.
    async function rowStride(page: Page): Promise<number> {
      const tall = await widgetRectById(page, 'w-wea');
      const short = await widgetRectById(page, 'w-cal');
      return (tall.height - short.height) / 2;
    }

    test('a 4x2 dragged to the bottom shifts the 4x4s below it up', async ({ page }) => {
      await gotoPanel(page, fullColumn([
        ['w-clock', 'monitoring', '4x2', 0], ['w-cal', 'lighting', '4x2', 2], ['w-wea', 'emoji', '4x4', 4],
        ['w-mon', 'emoji', '4x4', 8], ['w-coo', 'emoji', '4x4', 12],
      ]));
      expect(await gridRows(page)).toBe(16);
      expect(await cellRows(page)).toEqual({ 'w-clock': 0, 'w-cal': 2, 'w-wea': 4, 'w-mon': 8, 'w-coo': 12 });
      const from = await widgetCenterById(page, 'w-cal');
      const stride = await rowStride(page);

      // Twelve rows down puts the dragged rect's top on row 14: the last slot.
      await longPressDrag(page, from.x, from.y, from.x, from.y + 12 * stride);

      await expect.poll(() => cellRows(page))
        .toEqual({ 'w-clock': 0, 'w-wea': 2, 'w-mon': 6, 'w-coo': 10, 'w-cal': 14 });
    });

    test('a 4x2 dragged from the bottom to row 2 shifts the 4x4s down', async ({ page }) => {
      await gotoPanel(page, fullColumn([
        ['w-clock', 'monitoring', '4x2', 0], ['w-wea', 'emoji', '4x4', 2], ['w-mon', 'emoji', '4x4', 6],
        ['w-coo', 'emoji', '4x4', 10], ['w-cal', 'lighting', '4x2', 14],
      ]));
      expect(await gridRows(page)).toBe(16);
      const from = await widgetCenterById(page, 'w-cal');
      const stride = await rowStride(page);

      await longPressDrag(page, from.x, from.y, from.x, from.y - 12 * stride);

      await expect.poll(() => cellRows(page))
        .toEqual({ 'w-clock': 0, 'w-cal': 2, 'w-wea': 4, 'w-mon': 8, 'w-coo': 12 });
    });
  });

  test('post-drop layout has no overlapping widgets', async ({ page }) => {
    await gotoPanel(page);
    const before = await activeWidgetIds(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const fromCenter = await widgetCenterById(page, before[0]);
    const toCenter = await widgetCenterById(page, before[1]);

    await longPressDrag(page, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    await page.waitForTimeout(600);

    const ids = await activeWidgetIds(page);
    const rects = await Promise.all(ids.map(id => widgetRectById(page, id)));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapsX = a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2;
        const overlapsY = a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2;
        expect(overlapsX && overlapsY, `post-drop widgets ${ids[i]} and ${ids[j]} overlap`).toBe(false);
      }
    }
  });
});
