// @vitest-environment node
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { rendererBootScript, workerBootScript } from '../workerBoot';

// Runs a boot script against a minimal worker-shaped global whose fetch,
// createImageBitmap and WebAssembly are stand-ins, then probes what survives.
function bootedGlobal(script: string): Record<string, unknown> & { self: Record<string, unknown> } {
  const calls: string[] = [];
  const posts: unknown[] = [];
  const listeners: Array<(ev: { data: unknown }) => void> = [];
  const sandbox: Record<string, unknown> = {
    URL, Promise, TypeError, Request, Response, Object, atob,
    fetch: (input: unknown) => { calls.push((input as { url?: string }).url ?? String(input)); return Promise.resolve({ ok: true }); },
    createImageBitmap: () => 1,
    WebAssembly: {},
    OffscreenCanvas: class {},
    requestAnimationFrame: () => 1,
    WebSocket: class {},
    XMLHttpRequest: class {},
    postMessage: (m: unknown) => { posts.push(m); },
    addEventListener: (t: string, cb: (ev: { data: unknown }) => void) => { if (t === 'message') listeners.push(cb); },
    navigator: {},
    __calls: calls,
    __posts: posts,
    __deliver: (data: unknown) => { for (const cb of listeners) cb({ data }); },
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox as Record<string, unknown> & { self: Record<string, unknown> };
}

const probe = (g: object, expr: string) => vm.runInContext(expr, g);

describe('rendererBootScript', () => {
  it('keeps canvas, GL and decode globals the widget boot removes', () => {
    const g = bootedGlobal(rendererBootScript());
    for (const name of ['OffscreenCanvas', 'requestAnimationFrame', 'createImageBitmap', 'WebAssembly']) {
      expect(probe(g, `typeof ${name}`), name).not.toBe('undefined');
    }
    const w = bootedGlobal(workerBootScript());
    for (const name of ['createImageBitmap', 'WebAssembly', 'fetch']) {
      expect(probe(w, `typeof ${name}`), name).toBe('undefined');
    }
    expect(probe(w, 'typeof OffscreenCanvas')).not.toBe('undefined');
  });

  it('still removes network and channel globals', () => {
    const g = bootedGlobal(rendererBootScript());
    for (const name of ['WebSocket', 'XMLHttpRequest']) expect(probe(g, `typeof ${name}`), name).toBe('undefined');
  });

  it('serves fetch for blob: and data: URLs only', async () => {
    const g = bootedGlobal(rendererBootScript());
    const calls = g.__calls as string[];
    await expect(probe(g, 'fetch("blob:https://nexus.local/1234")')).resolves.toBeTruthy();
    await expect(probe(g, 'fetch("data:text/plain;base64,AA==")')).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
    for (const url of ['/apps-api/installed/x/asset/a.png', 'http://example.com/a', 'relative/path', '//example.com/a', 'ws://example.com']) {
      await expect(probe(g, `fetch(${JSON.stringify(url)})`), url).rejects.toBeInstanceOf(TypeError);
    }
    await expect(probe(g, 'fetch({ url: "http://example.com/a" })')).rejects.toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(2);
  });

  it('checks the request that is actually sent, not a spoofable string', async () => {
    const g = bootedGlobal(rendererBootScript());
    const calls = g.__calls as string[];
    await expect(probe(g, 'fetch({ url: "blob:https://nexus.local/1", toString() { return "http://example.com/a"; } })'))
      .rejects.toBeInstanceOf(TypeError);
    await expect(probe(g, `(() => {
      class Sneaky extends Request { get url() { return "blob:https://nexus.local/1"; } }
      return fetch(new Sneaky("http://example.com/a"));
    })()`)).rejects.toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
    await expect(probe(g, 'fetch(new Request("data:text/plain;base64,AA=="))')).resolves.toBeTruthy();
    expect(calls).toEqual(['data:text/plain;base64,AA==']);
  });

  it('is not fooled by replacing URL, Request or Request.prototype.url before fetch', async () => {
    const urlDesc = Object.getOwnPropertyDescriptor(Request.prototype, 'url')!;
    try {
      const g1 = bootedGlobal(rendererBootScript());
      probe(g1, 'self.URL = function () { return { protocol: "blob:" }; };');
      await expect(probe(g1, 'fetch("http://example.com/a")')).rejects.toBeInstanceOf(TypeError);

      const g2 = bootedGlobal(rendererBootScript());
      probe(g2, 'Object.defineProperty(Request.prototype, "url", { configurable: true, get() { return "blob:x"; } });');
      await expect(probe(g2, 'fetch("http://example.com/a")')).rejects.toBeInstanceOf(TypeError);
      Object.defineProperty(Request.prototype, 'url', urlDesc);

      const g3 = bootedGlobal(rendererBootScript());
      probe(g3, 'self.Request = class extends Request { get url() { return "blob:x"; } };');
      await expect(probe(g3, 'fetch("http://example.com/a")')).rejects.toBeInstanceOf(TypeError);

      const g4 = bootedGlobal(rendererBootScript());
      probe(g4, 'Function.prototype.call = () => 1; String.prototype.slice = () => "blob:"; String.prototype.toLowerCase = () => "blob:";');
      await expect(probe(g4, 'fetch("http://example.com/a")')).rejects.toBeInstanceOf(TypeError);
      expect((g1.__calls as string[]).length + (g2.__calls as string[]).length + (g3.__calls as string[]).length + (g4.__calls as string[]).length).toBe(0);
    } finally {
      Object.defineProperty(Request.prototype, 'url', urlDesc);
    }
  });

  it('relays an https GET to the host and builds a Response from the proxy envelope', async () => {
    const g = bootedGlobal(rendererBootScript());
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 26, 242]);
    const pending = probe(g, 'fetch("https://tiles.example.com/1/2/3.pbf")') as Promise<Response>;
    const posts = g.__posts as Array<{ type: string; id: number; url: string }>;
    expect(posts).toEqual([{ type: 'net-fetch', id: 1, url: 'https://tiles.example.com/1/2/3.pbf' }]);
    expect(g.__calls as string[]).toHaveLength(0);
    (g.__deliver as (d: unknown) => void)({
      type: 'net-result', id: 1,
      result: { ok: true, status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' }, bodyBase64: Buffer.from(bytes).toString('base64') },
    });
    const res = await pending;
    expect(res.ok).toBe(true);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('rejects when the host refuses, and never sends a non-GET to the host', async () => {
    const g = bootedGlobal(rendererBootScript());
    const pending = probe(g, 'fetch("https://evil.example.com/x")');
    (g.__deliver as (d: unknown) => void)({ type: 'net-result', id: 1, result: { ok: false, status: 0, error: 'host is not in the manifest net.fetch allowlist' } });
    await expect(pending).rejects.toBeInstanceOf(TypeError);
    await expect(probe(g, 'fetch("https://tiles.example.com/x", { method: "POST", body: "a" })')).rejects.toBeInstanceOf(TypeError);
    expect(g.__posts as unknown[]).toHaveLength(1);
  });

  it('returns a non-ok Response for an upstream error status', async () => {
    const g = bootedGlobal(rendererBootScript());
    const pending = probe(g, 'fetch("https://tiles.example.com/missing")') as Promise<Response>;
    (g.__deliver as (d: unknown) => void)({ type: 'net-result', id: 1, result: { ok: false, status: 404, statusText: 'Not Found', headers: {}, bodyText: 'nope' } });
    const res = await pending;
    expect(res.ok).toBe(false);
    expect(await res.text()).toBe('nope');
  });

  it('does not let the guard be replaced', () => {
    const g = bootedGlobal(rendererBootScript());
    expect(() => probe(g, '"use strict"; self.fetch = () => 1')).toThrow();
  });
});
