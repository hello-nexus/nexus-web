#!/usr/bin/env node
// Drag visual recorder: starts a drag from the FIRST visible widget,
// hovers the pointer over a sequence of points across the active page,
// and at each step dumps the current visual state (cells' inline
// transforms, which cell is under the pointer, what dnd-kit considers
// the over target). Lets us see exactly what the reorder strategy is
// doing as the cursor moves over various positions.
//
// Usage:
//   node scripts/panel-drag-recorder.mjs [--host=...] [--token-file=...]

import { chromium } from 'playwright';
import fs from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const eq = a.indexOf('=');
    return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
  }),
);

const HOST = args.host || 'http://192.168.1.235:9400';
const TOKEN = fs.readFileSync(args['token-file'] || '/tmp/amp-token.txt', 'utf8').trim();

const browser = await chromium.launch({ headless: !args.headful });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
});
const page = await ctx.newPage();
await page.goto(`${HOST}/panel`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-panel-widget-id]', { timeout: 15000 });
await page.waitForTimeout(2000);

// Snapshot all cells (id + size + rect) before drag begins.
const baseline = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('[data-panel-widget-id]'));
  return cells.map(c => {
    const r = c.getBoundingClientRect();
    return {
      id: c.getAttribute('data-panel-widget-id'),
      cls: typeof c.className === 'string' ? c.className.slice(0, 80) : '',
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      style: c.style.transform || '',
    };
  });
});

console.log('=== BASELINE ===');
for (const b of baseline) {
  console.log(`  ${b.id.slice(0, 8)} (${b.w}x${b.h}) at (${b.x}, ${b.y})`);
}
console.log('');

// Drag from the first visible widget to a series of probe positions.
const visible = baseline.find(b => b.x >= 0 && b.x <= 412 && b.y >= 0 && b.y <= 915);
if (!visible) {
  console.error('no visible widget');
  await browser.close();
  process.exit(1);
}
const src = { id: visible.id, x: visible.x + visible.w / 2, y: visible.y + visible.h / 2 };
console.log(`SOURCE: ${visible.id.slice(0, 8)} center=(${src.x}, ${src.y})`);
console.log('');

const client = await ctx.newCDPSession(page);
await client.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: src.x, y: src.y, id: 1 }],
});
await page.waitForTimeout(500);  // past delay activation

async function recordAt(label, x, y) {
  // Move to (x, y) in small steps so dnd-kit's onDragMove fires.
  // From wherever we are now, sweep to (x, y) in steps.
  const last = await page.evaluate(() => window.__lastDragXY ?? null) || src;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(20);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: last.x + (x - last.x) * (i / steps),
        y: last.y + (y - last.y) * (i / steps),
        id: 1,
      }],
    });
  }
  await page.waitForTimeout(150);
  await page.evaluate(p => { window.__lastDragXY = p; }, { x, y });

  const snap = await page.evaluate(({ px, py }) => {
    const cellsByPos = Array.from(document.querySelectorAll('[data-panel-widget-id]')).map(c => {
      const r = c.getBoundingClientRect();
      return {
        id: c.getAttribute('data-panel-widget-id'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cellTransform: c.style.transform || '',
      };
    });
    const stack = document.elementsFromPoint(px, py).slice(0, 8);
    const stackInfo = stack.map(e => {
      const wid = e instanceof Element ? e.closest('[data-panel-widget-id]')?.getAttribute('data-panel-widget-id') : null;
      return {
        tag: e.tagName,
        cls: typeof e.className === 'string' ? e.className : '',
        id: e.id || '',
        wid: wid?.slice(0, 8) || null,
      };
    });
    return { cellsByPos, stackInfo };
  }, { px: x, py: y });

  console.log(`--- ${label} cursor=(${x}, ${y}) ---`);
  console.log('  stack:');
  for (const s of snap.stackInfo) {
    console.log(`    ${s.tag} cls="${s.cls.slice(0, 60)}" id="${s.id}" wid=${s.wid || '-'}`);
  }
  for (const c of snap.cellsByPos) {
    const baseline_ = baseline.find(b => b.id === c.id);
    if (!baseline_) continue;
    const dx = c.x - baseline_.x;
    const dy = c.y - baseline_.y;
    const moved = (Math.abs(dx) > 1 || Math.abs(dy) > 1);
    const prefix = c.id === src.id ? '*' : ' ';
    if (moved || prefix === '*') {
      console.log(`  ${prefix} ${c.id.slice(0, 8)} (${c.w}x${c.h}) baseline=(${baseline_.x},${baseline_.y}) now=(${c.x},${c.y}) shift=(${dx}, ${dy}) inline=${c.cellTransform || '-'}`);
    }
  }
  console.log('');
}

// Probe a series of meaningful positions on the active page.
await recordAt('over widget 2 center',
  baseline[1] ? baseline[1].x + baseline[1].w / 2 : 100,
  baseline[1] ? baseline[1].y + baseline[1].h / 2 : 400);
await recordAt('over widget 3 center',
  baseline[2] ? baseline[2].x + baseline[2].w / 2 : 100,
  baseline[2] ? baseline[2].y + baseline[2].h / 2 : 600);
await recordAt('over widget 2 LEFT half',
  baseline[1] ? baseline[1].x + baseline[1].w * 0.25 : 100,
  baseline[1] ? baseline[1].y + baseline[1].h / 2 : 400);
await recordAt('over widget 2 RIGHT half',
  baseline[1] ? baseline[1].x + baseline[1].w * 0.75 : 100,
  baseline[1] ? baseline[1].y + baseline[1].h / 2 : 400);
await recordAt('over widget 2 TOP half',
  baseline[1] ? baseline[1].x + baseline[1].w / 2 : 100,
  baseline[1] ? baseline[1].y + baseline[1].h * 0.25 : 400);
await recordAt('over widget 2 BOTTOM half',
  baseline[1] ? baseline[1].x + baseline[1].w / 2 : 100,
  baseline[1] ? baseline[1].y + baseline[1].h * 0.75 : 400);

await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);

await browser.close();
