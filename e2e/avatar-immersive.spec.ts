// Drives the avatar SDK widget's tap-to-immersive flow on /panel with touch
// events: a tap on the tile opens the fullscreen immersive overlay (the tile
// itself is gesture-inert), camera orbit works only inside the overlay (and
// does not swipe-dismiss it), and exiting hands the live canvas back to the
// tile. Serves the REAL app bundle + encrypted pack from the nexus-apps
// worktree through route stubs, so the whole pipeline (worker -> ui-avatar ->
// three.js -> WebGL) runs as shipped.
//
// Run with PLAYWRIGHT_PORT=9443 if a real service holds :9400 - both ports
// class as service origins in src/api/service.ts.

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';

const specDir = dirname(fileURLToPath(import.meta.url));

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

const DEVICE_ID = 'avatar-immersive-spec';
const APP_ID = 'com.hellonexus.avatar';
const APPS_DIR = join(specDir, '../../nexus-apps-avatar-app/apps', APP_ID);

// The avatar app bundle + encrypted pack from the sibling nexus-apps worktree.
// Skip (not fail) when absent: the worktree is part of the avatar-dev setup,
// not of every checkout.
function readAppFile(rel: string): Buffer | null {
  try {
    return readFileSync(join(APPS_DIR, rel));
  } catch {
    return null;
  }
}

// The pack filename is character-specific; discover it from the app's assets
// dir rather than naming it here, so this repo carries no pack identity.
function findPackName(): string | null {
  try {
    return readdirSync(join(APPS_DIR, 'assets')).find((f) => f.endsWith('.nxpack')) ?? null;
  } catch {
    return null;
  }
}
const PACK_NAME = findPackName();

const AVATAR_LISTING = {
  id: APP_ID,
  name: 'Avatar',
  version: '0.1.0',
  surfaces: ['dashboard'],
  runtime: 'sdk',
  page: false,
  capabilities: { 'sensors.read': [], 'net.fetch': [] },
  sizes: ['2x2', '2x4', '4x4'],
  defaultSize: '2x4',
  source: 'bundled',
  trusted: true,
};

async function gotoAvatarPanel(page: Page) {
  const widgetMjs = readAppFile('widget.mjs')!;
  const packName = PACK_NAME!;
  const pack = readAppFile(`assets/${packName}`)!;
  const packKey = readAppFile(`assets/${packName}.key`)!;

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
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
    // Exposes window.__nexusAvatarSessions (runtime/camera) so the spec can
    // assert real camera movement instead of inferring it from pixels.
    localStorage.setItem('nexus_avatar_debug', '1');
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
              { type: `app:${APP_ID}`, size: '4x4', col: 0, row: 0 },
            ],
          },
        },
      },
    }),
  }));

  await page.route('**/apps-api/installed', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ apps: [AVATAR_LISTING] }),
  }));
  await page.route('**/apps-api/instance/**/settings', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ values: {} }),
  }));
  await page.route(`**/apps-api/installed/${APP_ID}/code-session`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sessionId: 'e2e', baseUrl: '/apps-code/e2e' }),
  }));
  await page.route('**/apps-code/e2e/widget.mjs', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: widgetMjs,
  }));
  // One glob for both pack + key: the widget requests carry a cache-busting
  // ?v=N, and playwright globs match the full URL including the query.
  await page.route(`**/apps-api/installed/${APP_ID}/asset/assets/${packName}*`, route => route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    body: route.request().url().includes('.key') ? packKey : pack,
  }));

  await page.goto(`/panel/${DEVICE_ID}`);
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });
}

function cameraPos(page: Page): Promise<{ x: number; y: number; z: number } | null> {
  return page.evaluate(() => {
    const sessions = (window as unknown as {
      __nexusAvatarSessions?: Array<{ runtime: { camera: { position: { x: number; y: number; z: number } } } }>;
    }).__nexusAvatarSessions;
    const cam = sessions?.[0]?.runtime.camera.position;
    return cam ? { x: cam.x, y: cam.y, z: cam.z } : null;
  });
}

// Euclidean distance; camera math yields -0 vs 0 noise, so positions compare
// by distance, never by deep equality.
function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

async function dragAcross(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  step: { dx: number; dy: number },
) {
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.5;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: startX, y: startY, id: 1 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX + i * step.dx, y: startY + i * step.dy, id: 1 }],
    });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd', touchPoints: [],
  });
  await cdp.detach();
}

test.describe('avatar tap-to-immersive', () => {
  test.skip(
    readAppFile('widget.mjs') === null || PACK_NAME === null,
    'nexus-apps-avatar-app worktree assets not present',
  );

  test('tile is inert, tap opens immersive, gestures live only there, exit hands the canvas back', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoAvatarPanel(page);

    const cell = page.locator('[data-panel-widget-id]').first();
    // The pack pipeline is real (decrypt + meshopt + shader compile on
    // SwiftShader), so allow a generous first-canvas budget.
    const tileCanvas = cell.locator('canvas');
    await tileCanvas.waitFor({ timeout: 60_000 });
    await expect(tileCanvas).toHaveCSS('pointer-events', 'none');

    // Wait for the session debug handle so camera assertions are live.
    await expect.poll(() => cameraPos(page), { timeout: 60_000 }).not.toBeNull();

    // A drag on the inert tile must not move the camera (no widget-mode
    // gestures) and must not open the overlay (movement cancels the tap).
    const before = (await cameraPos(page))!;
    const cellBox = (await cell.boundingBox())!;
    await dragAcross(page, cellBox, { dx: 14, dy: 6 });
    await page.waitForTimeout(400);
    const after = (await cameraPos(page))!;
    expect(dist(after, before)).toBeLessThan(1e-6);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // Tap -> fullscreen immersive.
    await page.touchscreen.tap(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 10_000 });

    // The shared canvas moved into the overlay and gestures are enabled.
    const overlayCanvas = dialog.locator('canvas');
    await overlayCanvas.waitFor({ timeout: 10_000 });
    await expect(overlayCanvas).toHaveCSS('pointer-events', 'auto');
    await expect(dialog.locator('[data-panel-no-sheet-swipe]')).toHaveCount(3); // avatar wrap + exit pill + corner X
    await expect(cell.locator('canvas')).toHaveCount(0);

    // Wait out the enter slide: a drag dispatched mid-animation lands on
    // translated coordinates and misses the canvas.
    await expect(dialog).toHaveAttribute('data-entered', 'true');

    // A DOWNWARD-dominant orbit drag moves the camera and must NOT engage the
    // overlay's swipe-down dismiss (the avatar wrap owns its gestures).
    const beforeOrbit = (await cameraPos(page))!;
    const overlayBox = (await dialog.boundingBox())!;
    await dragAcross(page, overlayBox, { dx: 4, dy: 16 });
    await expect
      .poll(async () => dist((await cameraPos(page))!, beforeOrbit), { timeout: 5_000 })
      .toBeGreaterThan(1e-3);
    await expect(dialog).toBeVisible();

    // Tapping the corner X exits (button order: grabber pill, then X); the
    // canvas returns to the tile, inert again.
    const closeBox = (await dialog.locator('button').nth(1).boundingBox())!;
    await page.touchscreen.tap(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    await expect(cell.locator('canvas')).toHaveCount(1);
    await expect(cell.locator('canvas')).toHaveCSS('pointer-events', 'none');
  });
});
