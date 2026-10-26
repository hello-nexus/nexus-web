import { test, expect } from '@playwright/test';
import { rendererBootScript, workerBootScript } from '../src/sandbox/workerBoot';

// A renderer worker must be able to draw with WebGL on an OffscreenCanvas while
// the widget worker's reachable surface stays closed (workerGlobals.spec.ts holds
// the full snapshot). Runs the real boot scripts in a real Chromium worker.

const PROBE = `
;(async function () {
  const out = { types: {}, webgl: null, blobFetch: null, dataFetch: null, httpFetch: null, pathFetch: null, spoofObject: null, spoofRequest: null, tamper: null };
  ['OffscreenCanvas', 'createImageBitmap', 'WebAssembly', 'requestAnimationFrame', 'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker', 'indexedDB']
    .forEach(function (k) { out.types[k] = typeof self[k]; });
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(8, 8);
      const gl = canvas.getContext('webgl');
      if (gl) {
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        out.webgl = Array.from(px);
      }
    }
  } catch (e) { out.webgl = 'error:' + e.message; }
  if (typeof fetch === 'function') {
    const attempt = async (url) => { try { const r = await fetch(url); return r.ok ? 'ok' : 'status:' + r.status; } catch (e) { return e.name; } };
    out.blobFetch = await attempt(URL.createObjectURL(new Blob(['x'])));
    out.dataFetch = await attempt('data:text/plain;base64,eA==');
    out.httpFetch = await attempt('http://127.0.0.1:1/a');
    out.pathFetch = await attempt('/sdk-runtime.mjs');
    const blobUrl = URL.createObjectURL(new Blob(['x']));
    out.spoofObject = await attempt({ url: blobUrl, toString: () => 'http://127.0.0.1:1/a' });
    class Sneaky extends Request { get url() { return blobUrl; } }
    out.spoofRequest = await attempt(new Sneaky('http://127.0.0.1:1/a'));
    // Last, because it damages the globals: the guard must not read them live.
    const target = 'http://127.0.0.1:1/a';
    const tamper = {};
    self.URL = function () { return { protocol: 'blob:' }; };
    tamper.url = await attempt(target);
    Object.defineProperty(Request.prototype, 'url', { configurable: true, get() { return 'blob:x'; } });
    tamper.getter = await attempt(target);
    self.Request = class extends Request { get url() { return 'blob:x'; } };
    tamper.request = await attempt(target);
    out.tamper = tamper;
  }
  self.postMessage(out);
})();
`;

type Report = {
  types: Record<string, string>; webgl: number[] | string | null;
  blobFetch: string | null; dataFetch: string | null; httpFetch: string | null; pathFetch: string | null;
  spoofObject: string | null; spoofRequest: string | null;
  tamper: { url: string; getter: string; request: string } | null;
};

async function run(page: import('@playwright/test').Page, boot: string): Promise<Report> {
  return page.evaluate(async (code) => {
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    return new Promise<Report>((resolve, reject) => {
      w.onmessage = (e) => { w.terminate(); resolve(e.data as Report); };
      w.onerror = (e) => reject(new Error(e.message));
    });
  }, boot + PROBE);
}

test('a renderer worker draws with WebGL on an OffscreenCanvas', async ({ page }) => {
  await page.goto('/');
  const r = await run(page, rendererBootScript());
  expect(r.types.OffscreenCanvas).not.toBe('undefined');
  expect(r.types.requestAnimationFrame).not.toBe('undefined');
  expect(r.types.createImageBitmap).not.toBe('undefined');
  expect(r.types.WebAssembly).not.toBe('undefined');
  // Software GL may be absent on a bare CI box; when a context exists it must draw.
  if (r.webgl !== null) expect(r.webgl).toEqual([255, 0, 0, 255]);
});

test('a renderer worker keeps network and channel globals closed and fetch blob-only', async ({ page }) => {
  await page.goto('/');
  const r = await run(page, rendererBootScript());
  for (const k of ['WebSocket', 'XMLHttpRequest', 'Worker', 'indexedDB']) expect(r.types[k], k).toBe('undefined');
  expect(r.types.fetch).toBe('function');
  expect(r.blobFetch).toBe('ok');
  expect(r.dataFetch).toBe('ok');
  expect(r.httpFetch).toBe('TypeError');
  expect(r.pathFetch).toBe('TypeError');
  // The check and the sent request must be the same object: spoofed strings and url getters fail.
  expect(r.spoofObject).toBe('TypeError');
  expect(r.spoofRequest).toBe('TypeError');
  expect(r.tamper).toEqual({ url: 'TypeError', getter: 'TypeError', request: 'TypeError' });
});

test('the widget worker surface is unchanged: no fetch, no decode, no wasm', async ({ page }) => {
  await page.goto('/');
  const r = await run(page, workerBootScript());
  for (const k of ['fetch', 'createImageBitmap', 'WebAssembly', 'WebSocket', 'XMLHttpRequest', 'Worker', 'indexedDB']) {
    expect(r.types[k], k).toBe('undefined');
  }
});
