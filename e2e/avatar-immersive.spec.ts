// Drives a character SDK app's immersive stage on /panel with touch events,
// against the REAL app bundle + encrypted pack (route stubs stand in for the
// service). The app builds its whole stage from SDK primitives - a YouTube
// embed (a real third-party player plays inside the overlay and its button
// opens the watch page through the service), a manipulation Layer for
// stickers (add, drag, pinch-scale, twist-rotate, persist, remove), a drawer
// that folds and returns - so this is the end-to-end proof of those
// primitives. The whole pipeline (worker -> host elements -> three.js ->
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

// The two brokered answers behind live detection, in the service proxy's
// envelope shape: the channel /live page comes back as text cut at the body
// cap (so not ok) with the broadcast in its canonical link, and the player
// call comes back as parsed JSON flagging it live.
const livePageHead = (videoId: string) =>
  `<!DOCTYPE html><html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${videoId}"></head>${'x'.repeat(2000)}`;
const playerAnswer = (videoId: string) => ({ videoDetails: { videoId, title: 'e2e live', isLive: true }, playabilityStatus: { status: 'OK' } });

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
  await page.route('**/apps-api/proxy', route => {
    const url = String((route.request().postDataJSON() as { url?: string }).url ?? '');
    const envelope = url.includes('/youtubei/v1/player')
      ? { ok: true, status: 200, statusText: 'OK', headers: {}, body: playerAnswer(LIVE_VIDEO_ID) }
      : { ok: false, status: 200, statusText: 'OK', headers: {}, bodyText: livePageHead(LIVE_VIDEO_ID), error: 'response exceeded 1048576-byte cap; truncated' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope) });
  });
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

test.describe('avatar immersive: live stream, stickers, drawer', () => {
  test.skip(
    APP_DIR === '' || APP_ID === '' || PANEL_VARIANT === '' || readAppFile('widget.mjs') === null
      || PACK_NAME === null || STICKER_NAME === null,
    'set AVATAR_E2E_APP_DIR + AVATAR_E2E_PANEL_VARIANT to a built character app with a pack and a sticker',
  );

  async function enterImmersive(page: Page) {
    const cell = page.locator('[data-panel-widget-id]').first();
    const cellBox = (await cell.boundingBox())!;
    await page.touchscreen.tap(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height * 0.35);
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('canvas').waitFor({ timeout: 30_000 });
    await expect(dialog).toHaveAttribute('data-entered', 'true');
    return dialog;
  }

  test('tile shows the watch button when live; Live docks a real embed, the drawer folds and returns, Close exits', async ({ page }) => {
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
    await watch.tap();
    await expect.poll(() => opened, { timeout: 5_000 }).toContain(`https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    const dialog = await enterImmersive(page);
    // The drawer opens on entry with no player; Live docks the embed.
    const liveBtn = dialog.getByRole('button', { name: 'Live' });
    await liveBtn.waitFor({ timeout: 30_000 });
    await expect(dialog.locator('[data-youtube]')).toHaveCount(0);
    await liveBtn.tap();
    const player = dialog.locator('[data-youtube]');
    await player.waitFor({ timeout: 30_000 });
    const iframe = player.locator('iframe');
    await expect(iframe).toHaveAttribute('src', new RegExp(`/embed/${LIVE_VIDEO_ID}\\?`));
    const playerBox = (await player.boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(playerBox.width).toBeGreaterThan(dialogBox.width * 0.8);
    expect(Math.abs(playerBox.width / playerBox.height - 16 / 9)).toBeLessThan(0.05);

    // The player is real: the third-party frame loads and mounts its video.
    await expect.poll(() => page.frames().some((f) => f.url().includes(`/embed/${LIVE_VIDEO_ID}`)), { timeout: 30_000 }).toBe(true);
    const frame = page.frames().find((f) => f.url().includes(`/embed/${LIVE_VIDEO_ID}`))!;
    await frame.locator('video').first().waitFor({ timeout: 45_000 });
    const playing = await frame.evaluate(async () => {
      const v = document.querySelector('video');
      if (!v) return { ready: -1, t0: 0, t1: 0 };
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 4000));
      return { ready: v.readyState, t0, t1: v.currentTime };
    });
    test.info().annotations.push({ type: 'embed', description: JSON.stringify(playing) });
    expect(playing.ready).toBeGreaterThanOrEqual(1);

    // Open button -> service open-url with the watch page.
    await dialog.getByRole('button', { name: /Watch on YouTube/ }).tap();
    await expect.poll(() => opened.length, { timeout: 5_000 }).toBe(2);
    expect(opened[1]).toBe(`https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`);

    // Hide folds the drawer to its lip (the player goes with it); the lip
    // brings it back; Close exits through the overlay.
    await dialog.getByRole('button', { name: 'Hide controls' }).tap();
    const lip = dialog.getByRole('button', { name: 'Show controls' });
    await lip.waitFor({ timeout: 5_000 });
    await expect(dialog.locator('[data-youtube]')).toHaveCount(0);
    await stableBox(page, lip);
    await lip.tap();
    await dialog.getByRole('button', { name: 'Live' }).waitFor({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
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

    const dialog = await enterImmersive(page);
    await dialog.getByRole('button', { name: 'Stickers' }).waitFor({ timeout: 30_000 });
    await expect(dialog.locator('[data-layer-gestures]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Stickers' }).tap();

    // Sticker mode: the stage takes gestures, the palette is up, a thumb adds
    // one at the stage centre.
    const layer = dialog.locator('[data-layer-gestures]');
    await layer.waitFor({ timeout: 5_000 });
    const thumbs = dialog.locator('button:has(img)');
    await expect.poll(() => thumbs.count(), { timeout: 5_000 }).toBeGreaterThan(0);
    await thumbs.first().tap();
    const sticker = layer.locator('[data-manipulable-id]');
    await expect(sticker).toHaveCount(1);
    await expect(sticker).toHaveAttribute('style', /left: 50%; top: 50%/);
    const layerBox = (await layer.boundingBox())!;
    const centre = { x: layerBox.x + layerBox.width / 2, y: layerBox.y + layerBox.height / 2 };
    const before = (await sticker.boundingBox())!;
    const tilt0 = parseTransform((await sticker.getAttribute('style'))!).rotate;
    expect(Math.abs(tilt0)).toBeLessThanOrEqual(12);

    // One finger drags it by (+60, +80) px.
    await touchGesture(page, [centre], [{ x: centre.x + 60, y: centre.y + 80 }]);
    const after = (await sticker.boundingBox())!;
    expect(after.x - before.x).toBeCloseTo(60, -1);
    expect(after.y - before.y).toBeCloseTo(80, -1);
    const stickerCentre = { x: after.x + after.width / 2, y: after.y + after.height / 2 };

    // Two fingers 40px apart spread to 80px and twist a quarter turn.
    await touchGesture(page,
      [{ x: stickerCentre.x - 20, y: stickerCentre.y }, { x: stickerCentre.x + 20, y: stickerCentre.y }],
      [{ x: stickerCentre.x, y: stickerCentre.y - 40 }, { x: stickerCentre.x, y: stickerCentre.y + 40 }]);
    const t = parseTransform((await sticker.getAttribute('style'))!);
    expect(t.scale).toBeCloseTo(2, 1);
    expect(t.rotate - tilt0).toBeCloseTo(90, 0);

    // The set round-trips through the worker's persisted local state.
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), localKey), { timeout: 5_000 })
      .toMatch(/"stickers":\[\{.*"scale":2.*\}\]/);

    // Done: the sticker stays, the stage is inert again.
    await dialog.getByRole('button', { name: 'Done' }).tap();
    await expect(dialog.locator('[data-layer-gestures]')).toHaveCount(0);
    await expect(dialog.locator('[data-manipulable-id]')).toHaveCount(1);

    // Back into sticker mode, select the sticker, remove it.
    await dialog.getByRole('button', { name: 'Stickers' }).tap();
    await layer.waitFor({ timeout: 5_000 });
    const sb = (await sticker.boundingBox())!;
    await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2);
    // Selecting it puts the host's remove handle on its top-right corner.
    const remove = sticker.locator('[data-manipulable-remove]');
    await remove.waitFor({ timeout: 5_000 });
    // The handle rides the sticker's OWN top-right corner, so with the twist
    // applied above it is that corner in screen space, not the screen's.
    const box = (await sticker.boundingBox())!;
    const style = (await sticker.getAttribute('style'))!;
    const shown = parseTransform(style);
    const base = Number(/width: ([\d.]+)px/.exec(style)![1]);
    const rad = (shown.rotate * Math.PI) / 180;
    const half = (base / 2) * shown.scale;
    const corner = {
      x: box.x + box.width / 2 + half * Math.cos(rad) + half * Math.sin(rad),
      y: box.y + box.height / 2 + half * Math.sin(rad) - half * Math.cos(rad),
    };
    const rb = (await remove.boundingBox())!;
    expect(Math.hypot(rb.x + rb.width / 2 - corner.x, rb.y + rb.height / 2 - corner.y)).toBeLessThan(6);
    // Upright and one size whatever the sticker's transform.
    expect(rb.width).toBeCloseTo(28, 0);
    await remove.tap();
    await expect(layer.locator('[data-manipulable-id]')).toHaveCount(0);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), localKey), { timeout: 5_000 })
      .toMatch(/"stickers":\[\]/);
  });

  test('a pinch with one finger on a sticker and one on the avatar leaves the camera clean', async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);
    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });
    const dialog = await enterImmersive(page);
    await dialog.getByRole('button', { name: 'Stickers' }).waitFor({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Stickers' }).tap();
    const layer = dialog.locator('[data-layer-gestures]');
    await layer.waitFor({ timeout: 5_000 });
    const thumbs = dialog.locator('button:has(img)');
    await expect.poll(() => thumbs.count(), { timeout: 5_000 }).toBeGreaterThan(0);
    await thumbs.first().tap();
    const sticker = layer.locator('[data-manipulable-id]');
    await expect(sticker).toHaveCount(1);
    const sb = (await sticker.boundingBox())!;
    const on = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 };
    // Second finger well outside the sticker, on the avatar canvas.
    const off = { x: on.x, y: on.y + sb.height * 1.5 };
    await touchGesture(page, [on, off], [on, { x: off.x, y: off.y + 60 }]);
    await dialog.getByRole('button', { name: 'Done' }).tap();
    await expect(dialog.locator('[data-layer-gestures]')).toHaveCount(0);

    // One finger on the avatar must orbit, never zoom: the slider stays put.
    const zoomSlider = dialog.locator('input[type="range"]').first();
    await zoomSlider.waitFor({ timeout: 5_000 });
    const zoomBefore = await zoomSlider.inputValue();
    const stageBox = (await dialog.locator('canvas').first().boundingBox())!;
    const c = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height * 0.6 };
    await touchGesture(page, [c], [{ x: c.x - 200, y: c.y }]);
    await touchGesture(page, [{ x: c.x - 200, y: c.y }], [{ x: c.x + 200, y: c.y }]);
    await page.waitForTimeout(500);
    expect(await zoomSlider.inputValue()).toBe(zoomBefore);
  });

  test('the zoom bar tracks a pinch while it runs, not only when it ends', async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);
    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });
    const dialog = await enterImmersive(page);
    const slider = dialog.locator('input[type="range"]').first();
    await slider.waitFor({ timeout: 30_000 });
    const start = await slider.inputValue();
    const box = (await dialog.locator('canvas').first().boundingBox())!;
    const c = { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
    const cdp = await page.context().newCDPSession(page);
    const pts = (spread: number) => [
      { x: c.x - spread, y: c.y, id: 1 },
      { x: c.x + spread, y: c.y, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(150) });
    let movedDuring = false;
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(150 - i * 12) });
      await page.waitForTimeout(40);
      if (await slider.inputValue() !== start) movedDuring = true;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(movedDuring, 'the bar moved before the fingers lifted').toBe(true);
  });

  test('Close still exits on a second immersive entry (the worker is reused)', async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);
    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });
    for (let i = 0; i < 2; i++) {
      const dialog = await enterImmersive(page);
      await dialog.getByRole('button', { name: 'Close', exact: true }).waitFor({ timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(dialog, `entry ${i + 1}`).toHaveCount(0, { timeout: 5_000 });
      await cell.locator('canvas').waitFor({ timeout: 30_000 });
    }
  });

  for (const withSticker of [false, true]) {
    const title = withSticker ? 'after a sticker is added and Done' : 'with no sticker';
    test(`${title}, the avatar pinch-zooms and Close exits`, async ({ page }) => {
    test.setTimeout(180_000);
    const opened: string[] = [];
    await gotoPanel(page, opened);
    const cell = page.locator('[data-panel-widget-id]').first();
    await cell.locator('canvas').waitFor({ timeout: 90_000 });
    const dialog = await enterImmersive(page);
    await dialog.getByRole('button', { name: 'Stickers' }).waitFor({ timeout: 30_000 });
    if (withSticker) {
      await dialog.getByRole('button', { name: 'Stickers' }).tap();
      const layer = dialog.locator('[data-layer-gestures]');
      await layer.waitFor({ timeout: 5_000 });
      const thumbs = dialog.locator('button:has(img)');
      await expect.poll(() => thumbs.count(), { timeout: 5_000 }).toBeGreaterThan(0);
      await thumbs.first().tap();
      await expect(layer.locator('[data-manipulable-id]')).toHaveCount(1);
      await dialog.getByRole('button', { name: 'Done' }).tap();
      await expect(dialog.locator('[data-layer-gestures]')).toHaveCount(0);
    }

    const zoomSlider = dialog.locator('input[type="range"]').first();
    await zoomSlider.waitFor({ timeout: 5_000 });
    const zoomBefore = await zoomSlider.inputValue();
    const stageBox = (await dialog.locator('canvas').first().boundingBox())!;
    const c = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height * 0.3 };
    await touchGesture(page, [{ x: c.x - 120, y: c.y }, { x: c.x + 120, y: c.y }], [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }]);
    await expect.poll(() => zoomSlider.inputValue(), { timeout: 5_000 }).not.toBe(zoomBefore);

    await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    });
  }
});
