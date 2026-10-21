// @vitest-environment node
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { rendererBootScript, workerBootScript } from '../workerBoot';

// Runs a boot script against a minimal worker-shaped global whose fetch,
// createImageBitmap and WebAssembly are stand-ins, then probes what survives.
function bootedGlobal(script: string): Record<string, unknown> & { self: Record<string, unknown> } {
  const calls: string[] = [];
  const sandbox: Record<string, unknown> = {
    URL, Promise, TypeError, Request, Object,
    fetch: (input: unknown) => { calls.push((input as { url?: string }).url ?? String(input)); return Promise.resolve({ ok: true }); },
    createImageBitmap: () => 1,
    WebAssembly: {},
    OffscreenCanvas: class {},
    requestAnimationFrame: () => 1,
    WebSocket: class {},
    XMLHttpRequest: class {},
    postMessage: () => {},
    addEventListener: () => {},
    navigator: {},
    __calls: calls,
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
    for (const url of ['/apps-api/installed/x/asset/a.png', 'https://example.com/a', 'http://example.com/a', 'relative/path', '//example.com/a', 'ws://example.com']) {
      await expect(probe(g, `fetch(${JSON.stringify(url)})`), url).rejects.toBeInstanceOf(TypeError);
    }
    await expect(probe(g, 'fetch({ url: "https://example.com/a" })')).rejects.toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(2);
  });

  it('checks the request that is actually sent, not a spoofable string', async () => {
    const g = bootedGlobal(rendererBootScript());
    const calls = g.__calls as string[];
    await expect(probe(g, 'fetch({ url: "blob:https://nexus.local/1", toString() { return "https://example.com/a"; } })'))
      .rejects.toBeInstanceOf(TypeError);
    await expect(probe(g, `(() => {
      class Sneaky extends Request { get url() { return "blob:https://nexus.local/1"; } }
      return fetch(new Sneaky("https://example.com/a"));
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
      await expect(probe(g1, 'fetch("https://example.com/a")')).rejects.toBeInstanceOf(TypeError);

      const g2 = bootedGlobal(rendererBootScript());
      probe(g2, 'Object.defineProperty(Request.prototype, "url", { configurable: true, get() { return "blob:x"; } });');
      await expect(probe(g2, 'fetch("https://example.com/a")')).rejects.toBeInstanceOf(TypeError);
      Object.defineProperty(Request.prototype, 'url', urlDesc);

      const g3 = bootedGlobal(rendererBootScript());
      probe(g3, 'self.Request = class extends Request { get url() { return "blob:x"; } };');
      await expect(probe(g3, 'fetch("https://example.com/a")')).rejects.toBeInstanceOf(TypeError);

      const g4 = bootedGlobal(rendererBootScript());
      probe(g4, 'Function.prototype.call = () => 1; String.prototype.slice = () => "blob:"; String.prototype.toLowerCase = () => "blob:";');
      await expect(probe(g4, 'fetch("https://example.com/a")')).rejects.toBeInstanceOf(TypeError);
      expect((g1.__calls as string[]).length + (g2.__calls as string[]).length + (g3.__calls as string[]).length + (g4.__calls as string[]).length).toBe(0);
    } finally {
      Object.defineProperty(Request.prototype, 'url', urlDesc);
    }
  });

  it('does not let the guard be replaced', () => {
    const g = bootedGlobal(rendererBootScript());
    expect(() => probe(g, '"use strict"; self.fetch = () => 1')).toThrow();
  });
});
