// Pins the widget-edit backdrop treatment (NEX-41): opening a widget's edit
// sheet blurs the stage behind it (so ambient widget motion doesn't compete
// with the editor) while the edited widget itself stays docked above the blur,
// and the add-widget catalog keeps the plain un-blurred scrim (picking a
// widget needs the live panel readable). jsdom does not compute styles from
// the compiled stylesheet, so this lives in e2e.

import { test, expect, type Page } from '@playwright/test';
import { PANEL_CONTEXT_MENU_TRIGGER_MS } from '../src/panel/engine/usePanelTouchMode';

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

const DEVICE_ID = 'panel-edit-blur-spec';

async function gotoPanel(page: Page) {
  await page.addInitScript(() => {
    // Keep the optimistic local layout stable across the test (see
    // panel-drag.spec.ts for the full rationale).
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
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/panel/devices/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/preferences', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/pair', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/ping', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }),
  }));
  // One 4x2 widget in the top half: the widget long-press target sits in the
  // top rows and the empty bottom half hosts the background long-press that
  // opens the actions tray.
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
            ],
          },
        },
      },
    }),
  }));
  await page.goto(`/panel/${DEVICE_ID}`);
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

// Long-press without movement, held comfortably past the context-menu
// trigger delay, synthesized through CDP so the pointer pipeline sees real
// touch state.
async function longPress(page: Page, x: number, y: number) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await new Promise(r => setTimeout(r, PANEL_CONTEXT_MENU_TRIGGER_MS + 190));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await client.detach();
  }
}

// Resolved blur radius on the backdrop element. The scrimIn keyframe's fill
// holds backdrop-filter active on EVERY backdrop (a no-op blur(0px) outside
// settings mode), so the discriminator is the radius, not none-vs-blur.
async function backdropBlurRadius(page: Page, mode: string): Promise<number | null> {
  return page.evaluate((m) => {
    const el = document.querySelector(`[role="dialog"][data-mode="${m}"]`);
    if (!el) return null;
    const match = /blur\((\d+(?:\.\d+)?)px\)/.exec(getComputedStyle(el).backdropFilter);
    return match ? Number(match[1]) : 0;
  }, mode);
}

test.describe('widget edit backdrop blur', () => {
  test('edit sheet blurs the stage and keeps the edited widget docked above it', async ({ page }) => {
    await gotoPanel(page);

    const widget = page.locator('[data-panel-widget-id]').first();
    const box = await widget.boundingBox();
    if (!box) throw new Error('no widget box');
    await longPress(page, box.x + box.width / 2, box.y + box.height / 2);

    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.locator('[role="dialog"][data-mode="settings"]');
    await dialog.waitFor({ timeout: 5_000 });

    expect(await backdropBlurRadius(page, 'settings')).toBeGreaterThan(0);
    // The edited widget is hoisted into the dock portal, above the blur layer.
    await expect(page.locator('[data-cell-state="docked"]')).toBeAttached();

    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath('edit-settings-blur.png') });
  });

  test('add-widget catalog keeps the un-blurred scrim', async ({ page }) => {
    await gotoPanel(page);

    // Empty bottom half of the grid: opens the actions tray.
    await longPress(page, 206, 700);
    await page.getByRole('button', { name: 'Add widget' }).click();
    const dialog = page.locator('[role="dialog"][data-mode="catalog"]');
    await dialog.waitFor({ timeout: 5_000 });

    expect(await backdropBlurRadius(page, 'catalog')).toBe(0);

    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath('catalog-no-blur.png') });
  });
});
