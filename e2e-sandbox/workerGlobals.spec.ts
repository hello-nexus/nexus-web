import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workerBootScript } from '../src/sandbox/workerBoot';

// Chromium hosts some denied names on WorkerGlobalScope.prototype; jsdom cannot
// model that, so this boots the real boot script in a real Chromium worker.

const SNAPSHOT = fileURLToPath(new URL('./workerGlobals.snapshot.json', import.meta.url));

const DENIED_GLOBALS = [
  'fetch', 'WebSocket', 'WebSocketStream', 'WebTransport', 'XMLHttpRequest', 'EventSource',
  'importScripts', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'BroadcastChannel',
  'MessageChannel', 'indexedDB', 'caches', 'SharedArrayBuffer', 'Notification',
  'webkitRequestFileSystem', 'webkitRequestFileSystemSync', 'webkitResolveLocalFileSystemURL',
  'webkitResolveLocalFileSystemSyncURL', 'Worker', 'SharedWorker', 'ServiceWorker',
  'createImageBitmap', 'WebAssembly', 'FontFace', 'fonts',
];
const DENIED_NAVIGATOR = [
  'sendBeacon', 'usb', 'hid', 'serial', 'bluetooth', 'gpu', 'serviceWorker', 'storage', 'storageBuckets', 'locks',
  'credentials', 'mediaDevices', 'clipboard', 'wakeLock', 'ml', 'xr',
];

// Runs inside the worker after the boot script. Reports, per object on each
// chain, every own name that still resolves to something other than undefined.
const PROBE = `
;(function () {
  function chainOf(root) {
    var out = [];
    for (var o = root; o; o = Object.getPrototypeOf(o)) out.push(o);
    return out;
  }
  function label(o, i) {
    var c = Object.prototype.hasOwnProperty.call(o, 'constructor') ? o.constructor : null;
    return i + ':' + ((c && c.name) || (i === 0 ? 'instance' : 'anonymous'));
  }
  function reachable(root) {
    var res = {};
    chainOf(root).forEach(function (o, i) {
      var names = [];
      Object.getOwnPropertyNames(o).forEach(function (n) {
        var v;
        try { v = Reflect.get(o, n, root); } catch (_) { v = null; }
        if (typeof v !== 'undefined') names.push(n);
      });
      res[label(o, i)] = names.sort();
    });
    return res;
  }
  self.postMessage({
    g: reachable(self),
    n: reachable(self.navigator),
    typeofs: (function () {
      var t = {};
      ['fetch','WebSocket','importScripts','indexedDB','fonts','createImageBitmap'].forEach(function (k) { t[k] = typeof self[k]; });
      return t;
    })(),
  });
})();
`;

type Report = { g: Record<string, string[]>; n: Record<string, string[]>; typeofs: Record<string, string> };

async function bootReport(page: import('@playwright/test').Page): Promise<Report> {
  const src = workerBootScript() + PROBE;
  return page.evaluate(async (code) => {
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    return new Promise<Report>((resolve, reject) => {
      w.onmessage = (e) => { w.terminate(); resolve(e.data as Report); };
      w.onerror = (e) => reject(new Error(e.message));
    });
  }, src);
}

function flatten(r: Record<string, string[]>): Set<string> {
  return new Set(Object.values(r).flat());
}

test('no denylisted name resolves anywhere on the worker global or navigator chains', async ({ page }) => {
  await page.goto('/');
  const r = await bootReport(page);

  const g = flatten(r.g);
  const n = flatten(r.n);
  const leakedGlobals = DENIED_GLOBALS.filter((name) => g.has(name));
  const leakedNav = DENIED_NAVIGATOR.filter((name) => n.has(name));
  expect(leakedGlobals, 'denylisted globals still reachable').toEqual([]);
  expect(leakedNav, 'denylisted navigator members still reachable').toEqual([]);
  for (const k of Object.keys(r.typeofs)) expect(r.typeofs[k], `typeof self.${k}`).toBe('undefined');
});

test('reachable worker surface matches the reviewed snapshot', async ({ page }) => {
  await page.goto('/');
  const r = await bootReport(page);
  const actual = { globals: r.g, navigator: r.n };

  if (process.env.UPDATE_WORKER_SNAPSHOT === '1') {
    writeFileSync(SNAPSHOT, JSON.stringify(actual, null, 2) + '\n');
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { globals: Record<string, string[]>; navigator: Record<string, string[]> };

  // Only additions fail: a newly reachable name must be reviewed for network or
  // device capability, then denied in workerBoot.ts or accepted via
  // UPDATE_WORKER_SNAPSHOT=1. Removals and boot-script locals (_-prefixed) pass.
  const added = (now: Record<string, string[]>, known: Record<string, string[]>) => {
    const seen = flatten(known);
    return [...flatten(now)].filter((name) => !name.startsWith('_') && !seen.has(name)).sort();
  };
  expect(added(actual.globals, expected.globals), 'newly reachable worker globals').toEqual([]);
  expect(added(actual.navigator, expected.navigator), 'newly reachable navigator members').toEqual([]);
});
