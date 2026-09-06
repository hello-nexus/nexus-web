// Drives a character SDK app's immersive extras on /panel with touch events,
// against the REAL app bundle + encrypted pack (route stubs stand in for the
// service): the live-stream dock (a real third-party embed plays inside the
// overlay and its button opens the watch page through the service), sticker
// mode (add, drag, pinch-scale, twist-rotate, persist, remove), and the tile's
// own watch button. The whole pipeline (worker -> ui-avatar -> three.js ->
// WebGL) runs as shipped.
//
// The app is private and character-specific, so this repo names none of it:
//   AVATAR_E2E_APP_DIR        the app dir (manifest.json, widget.mjs, assets/)
//   AVATAR_E2E_PANEL_VARIANT  the displays.panelVariant value the app's gate accepts
//   AVATAR_E2E_VIDEO_ID       a video that is live right now (default below)
// Skipped, not failed, when the app dir is absent.
//
// Run with PLAYWRIGHT_PORT=9443 if a real service holds :9400 - both ports
// class as service origins in src/api/service.ts.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});

const DEVICE_ID = 'avatar-immersive-spec';
const APP_DIR = process.env.AVATAR_E2E_APP_DIR ?? '';
const PANEL_VARIANT = process.env.AVATAR_E2E_PANEL_VARIANT ?? '';
// A 24/7 broadcast that is live around the clock, so the embed inside the
// overlay is a real live player. Override when it ever goes dark.
const LIVE_VIDEO_ID = process.env.AVATAR_E2E_VIDEO_ID ?? 'rFZHOHl-L8A';

function readAppFile(rel: string): Buffer | null {
  try {
    return readFileSync(join(APP_DIR, rel));
  } catch {
    return null;
  }
}

function findPackName(): string | null {
  try {
    return readdirSync(join(APP_DIR, 'assets')).find((f) => f.endsWith('.nxpack')) ?? null;
  } catch {
    return null;
  }
}
const PACK_NAME = findPackName();

function readManifestId(): string | null {
  try {
    const id = (JSON.parse(readFileSync(join(APP_DIR, 'manifest.json'), 'utf8')) as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}
const APP_ID = readManifestId() ?? '';

function findStickerName(): string | null {
  try {
    return readdirSync(join(APP_DIR, 'assets/stickers')).find((f) => f.endsWith('.png')) ?? null;
  } catch {
    return null;
  }
}
const STICKER_NAME = findStickerName();

const LISTING = {
  id: APP_ID,
  name: 'Character',
  version: '0.0.0',
  surfaces: ['dashboard', 'phone'],
  runtime: 'sdk',
  page: false,
  immersive: true,
  singleInstance: true,
  capabilities: { 'sensors.read': [], 'net.fetch': ['www.youtube.com'], dispatch: ['displays.panelVariant'] },
  sizes: ['4x4'],
  defaultSize: '4x4',
  source: 'user',
  trusted: true,
};

// The shape of a channel /live page for a broadcast that is on air, reduced
// to the markers the app's parser reads (verified against captured pages).
const livePage = (videoId: string) =>
  `<html>${'x'.repeat(200)}"videoDetails":{"videoId":"${videoId}","title":"e2e live","lengthSeconds":"0","isLive":true}</html>`;

async function gotoPanel(page: Page, opened: string[]) {
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
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
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
  await page.route('**/defaults', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      panel: {
        layouts: {
          phone: {
            layoutSchemaVersion: 2,
            surface: 'phone',
            widgets: [{ type: `app:${APP_ID}`, size: '4x4', col: 0, row: 0 }],
          },
        },
      },
    }),
  }));
  await page.route('**/apps-api/installed', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ apps: [LISTING] }),
  }));
  await page.route('**/apps-api/instance/**/settings', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ values: {} }),
  }));
  await page.route(`**/apps-api/installed/${APP_ID}/code-session`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'e2e', baseUrl: '/apps-code/e2e' }),
  }));
  await page.route('**/apps-code/e2e/widget.mjs', route => route.fulfill({
    status: 200, contentType: 'text/javascript', body: widgetMjs,
  }));
  await page.route(`**/apps-api/installed/${APP_ID}/asset/assets/${packName}*`, route => route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    body: route.request().url().includes('.key') ? packKey : pack,
  }));
  await page.route(`**/apps-api/installed/${APP_ID}/asset/assets/stickers/*`, route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const png = readAppFile(`assets/stickers/${name}`);
    return png
      ? route.fulfill({ status: 200, contentType: 'image/png', body: png })
      : route.fulfill({ status: 404, body: '' });
  });
  // The panel gate: the service reports the character's own panel.
  await page.route('**/apps-api/dispatch', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { variant: PANEL_VARIANT } }),
  }));
  // The brokered channel poll: on air, with the real 24/7 broadcast's id.
  await page.route('**/apps-api/proxy', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, status: 200, statusText: 'OK', headers: {}, body: livePage(LIVE_VIDEO_ID) }),
  }));
  await page.route('**/system/open-url', route => {
    opened.push((route.request().postDataJSON() as { url: string }).url);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false, msg: '' }) });
  });

  await page.goto(`/panel/${DEVICE_ID}`);
  await page.locator('[data-panel-widget-id]').first().waitFor({ timeout: 15_000 });
}

type Pt = { x: number; y: number };

async function touchGesture(page: Page, from: Pt[], to: Pt[], steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (a: Pt[], b: Pt[], k: number) =>
    a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * k, y: p.y + (b[i].y - p.y) * k, id: i + 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from, to, 0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from, to, i / steps) });
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

function parseTransform(t: string): { rotate: number; scale: number } {
  const r = /rotate\((-?[\d.]+)deg\)/.exec(t);
  const s = /scale\((-?[\d.]+)\)/.exec(t);
  return { rotate: r ? Number(r[1]) : 0, scale: s ? Number(s[1]) : 1 };
}

async function tapCenter(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

// A control that has just mounted can still be sliding into place (the tile
// re-lays out around it); tapping the box read a frame earlier lands beside
// it. Wait for two identical reads before trusting the box.
async function stableBox(page: Page, locator: ReturnType<Page['locator']>) {
  let prev = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await locator.boundingBox();
    if (prev && next && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) return next;
    prev = next;
  }
  return prev!;
}

test.describe('avatar immersive: live stream dock + stickers', () => {
  test.skip(
    APP_DIR === '' || APP_ID === '' || PANEL_VARIANT === '' || readAppFile('widget.mjs') === null
      || PACK_NAME === null || STICKER_NAME === null,
    'set AVATAR_E2E_APP_DIR + AVATAR_E2E_PANEL_VARIANT to a built character app with a pack and a sticker',
  );

  test('tile shows the watch button when live; immersive docks a real live embed and opens it via the service', async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);

    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });

    // The tile's own button appears once the poll reads live; a tap opens the
    // watch page through the service, never a new window in the panel.
    const watch = cell.getByRole('button', { name: /Watch on YouTube/ });
    await watch.waitFor({ timeout: 15_000 });
    await stableBox(page, watch);
    // Playwright's own tap hit-tests the target, so a tile still settling
    // around the new row cannot turn this into a tap on the character.
    await watch.tap();
    await expect.poll(() => opened, { timeout: 5_000 }).toContain(`https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // Tap the character (above the button) -> fullscreen immersive.
    const cellBox = (await cell.boundingBox())!;
    await page.touchscreen.tap(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height * 0.35);
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('canvas').waitFor({ timeout: 30_000 });
    await expect(dialog).toHaveAttribute('data-entered', 'true');

    // The drawer opens on entry; Live pops the embed (large, 16:9) with the
    // open button beside it. The tile's own watch button is an in-tile
    // affordance only.
    const drawer = dialog.locator('[data-avatar-dock]');
    await expect(drawer).toHaveAttribute('data-avatar-drawer', 'open');
    await expect(dialog.locator('[data-avatar-stream]')).toHaveCount(0);
    const liveBtn = dialog.getByRole('button', { name: 'Live' });
    await liveBtn.waitFor({ timeout: 30_000 });
    await tapCenter(page, (await liveBtn.boundingBox())!);
    const stream = dialog.locator('[data-avatar-stream]');
    await stream.waitFor({ timeout: 30_000 });
    const iframe = stream.locator('iframe');
    await expect(iframe).toHaveAttribute('src', new RegExp(`/embed/${LIVE_VIDEO_ID}\\?`));
    const streamBox = (await stream.boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(streamBox.width).toBeGreaterThan(dialogBox.width * 0.8);
    expect(Math.abs(streamBox.width / streamBox.height - 16 / 9)).toBeLessThan(0.05);
    expect(streamBox.y + streamBox.height).toBeGreaterThan(dialogBox.height * 0.6);
    await expect(dialog.getByRole('button', { name: /Watch on YouTube/ })).toHaveCount(1);

    // The player is real: the third-party frame loads and mounts its video.
    const frame = page.frames().find((f) => f.url().includes(`/embed/${LIVE_VIDEO_ID}`));
    expect(frame).toBeTruthy();
    const video = frame!.locator('video');
    await video.first().waitFor({ timeout: 45_000 });
    const playing = await frame!.evaluate(async () => {
      const v = document.querySelector('video');
      if (!v) return { ready: -1, t0: 0, t1: 0 };
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 4000));
      return { ready: v.readyState, t0, t1: v.currentTime };
    });
    test.info().annotations.push({ type: 'embed', description: JSON.stringify(playing) });
    expect(playing.ready).toBeGreaterThanOrEqual(1);

    // Open button -> service open-url with the watch page.
    const openBtn = dialog.getByRole('button', { name: /Watch on YouTube/ });
    await tapCenter(page, (await openBtn.boundingBox())!);
    await expect.poll(() => opened.length, { timeout: 5_000 }).toBe(2);
    expect(opened[1]).toBe(`https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`);
    await expect(dialog).toBeVisible();

    // The chevron folds the drawer to its lip (and takes the player with it);
    // the lip brings it back. The drawer's X exits the immersive view.
    await tapCenter(page, (await dialog.getByRole('button', { name: 'Hide controls' }).boundingBox())!);
    await expect(drawer).toHaveAttribute('data-avatar-drawer', 'closed');
    await expect(dialog.locator('[data-avatar-stream]')).toHaveCount(0);
    // The fold is a slide; read the lip once it has settled at the bottom edge.
    const lip = dialog.getByRole('button', { name: 'Show controls' });
    const lipBox = await stableBox(page, lip);
    expect(lipBox.y + lipBox.height).toBeGreaterThan(dialogBox.height * 0.9);
    await lip.tap();
    await expect(drawer).toHaveAttribute('data-avatar-drawer', 'open');
    await tapCenter(page, (await drawer.getByRole('button', { name: 'Close immersive view' }).boundingBox())!);
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    await expect(cell.locator('canvas')).toHaveCount(1);
  });

  test('sticker mode: add, drag, pinch, twist, persist, remove', async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);

    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });
    const instanceId = await cell.getAttribute('data-panel-widget-id');
    const localKey = `nexus.sdk.local.${APP_ID}.${instanceId}`;

    const cellBox = (await cell.boundingBox())!;
    await page.touchscreen.tap(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height * 0.35);
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('canvas').waitFor({ timeout: 30_000 });
    await expect(dialog).toHaveAttribute('data-entered', 'true');

    // No stickers yet: an empty, inert layer and a Stickers button in the dock.
    await expect(dialog.locator('[data-avatar-stickers]')).toHaveAttribute('data-avatar-stickers', 'view');
    await expect(dialog.locator('[data-sticker-id]')).toHaveCount(0);
    const stickersBtn = dialog.getByRole('button', { name: 'Stickers' });
    await stickersBtn.waitFor({ timeout: 30_000 });
    await tapCenter(page, (await stickersBtn.boundingBox())!);

    // Sticker mode: palette up, layer editing, the first thumb adds one at
    // the stage centre.
    const palette = dialog.locator('[data-avatar-palette]');
    await palette.waitFor({ timeout: 5_000 });
    const layer = dialog.locator('[data-avatar-stickers]');
    await expect(layer).toHaveAttribute('data-avatar-stickers', 'editing');
    await tapCenter(page, (await palette.locator('button').first().boundingBox())!);
    const sticker = layer.locator('[data-sticker-id]');
    await expect(sticker).toHaveCount(1);
    await expect(sticker).toHaveAttribute('style', /left: 50%; top: 50%/);
    const layerBox = (await layer.boundingBox())!;
    const centre = { x: layerBox.x + layerBox.width / 2, y: layerBox.y + layerBox.height / 2 };
    const before = (await sticker.boundingBox())!;
    // A fresh sticker lands with a small random tilt; gestures are relative to it.
    const tilt0 = parseTransform((await sticker.getAttribute('style'))!).rotate;
    expect(Math.abs(tilt0)).toBeLessThanOrEqual(12);

    // One finger drags it by (+60, +80) px.
    await touchGesture(page, [centre], [{ x: centre.x + 60, y: centre.y + 80 }]);
    const after = (await sticker.boundingBox())!;
    expect(after.x - before.x).toBeCloseTo(60, -1);
    expect(after.y - before.y).toBeCloseTo(80, -1);
    const stickerCentre = { x: after.x + after.width / 2, y: after.y + after.height / 2 };

    // Two fingers 40px apart spread to 80px and twist a quarter turn.
    const a0 = { x: stickerCentre.x - 20, y: stickerCentre.y };
    const b0 = { x: stickerCentre.x + 20, y: stickerCentre.y };
    const a1 = { x: stickerCentre.x, y: stickerCentre.y - 40 };
    const b1 = { x: stickerCentre.x, y: stickerCentre.y + 40 };
    await touchGesture(page, [a0, b0], [a1, b1]);
    const t = parseTransform((await sticker.getAttribute('style'))!);
    expect(t.scale).toBeCloseTo(2, 1);
    expect(t.rotate - tilt0).toBeCloseTo(90, 0);

    // The set round-trips through the worker's persisted local state.
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), localKey), { timeout: 5_000 })
      .toMatch(/"stickers":\[\{.*"s":2.*\}\]/);

    // Done: the layer stays but is inert (orbit drags reach the canvas again).
    const done = dialog.getByRole('button', { name: 'Done' });
    await tapCenter(page, (await done.boundingBox())!);
    await expect(layer).toHaveAttribute('data-avatar-stickers', 'view');
    await expect(layer).toHaveCSS('pointer-events', 'none');
    await expect(sticker).toHaveCount(1);

    // Back into sticker mode, select the sticker, remove it with its badge.
    await tapCenter(page, (await dialog.getByRole('button', { name: 'Stickers' }).boundingBox())!);
    const sb = (await sticker.boundingBox())!;
    await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2);
    const remove = sticker.getByRole('button', { name: 'Remove sticker' });
    await remove.waitFor({ timeout: 5_000 });
    await tapCenter(page, (await remove.boundingBox())!);
    await expect(layer.locator('[data-sticker-id]')).toHaveCount(0);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), localKey), { timeout: 5_000 })
      .toMatch(/"stickers":\[\]/);
  });
});
