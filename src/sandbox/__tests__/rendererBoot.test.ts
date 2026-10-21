// @vitest-environment node
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { rendererBootScript, workerBootScript } from '../workerBoot';

// Runs a boot script against a minimal worker-shaped global whose fetch,
// createImageBitmap and WebAssembly are stand-ins, then probes what survives.
function bootedGlobal(script: string): Record<string, unknown> & { self: Record<string, unknown> } {
  const calls: string[] = [];
  const sandbox: Record<string, unknown> = {
    URL, Promise, TypeError,
    fetch: (input: unknown) => { calls.push(String(input)); return Promise.resolve({ ok: true }); },
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

  it('does not let the guard be replaced', () => {
    const g = bootedGlobal(rendererBootScript());
    expect(() => probe(g, '"use strict"; self.fetch = () => 1')).toThrow();
  });
});
