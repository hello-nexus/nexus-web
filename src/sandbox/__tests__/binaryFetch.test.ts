// @vitest-environment node
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { workerBootScript } from '../workerBoot';

type Listener = (ev: { data: unknown }) => void;

function widgetWorker() {
  const posts: Array<{ type: string; id?: number; payload?: unknown }> = [];
  const listeners: Listener[] = [];
  const sandbox: Record<string, unknown> = {
    Promise, TypeError, Object, atob, TextDecoder, TextEncoder, JSON,
    setInterval, clearInterval, setTimeout, clearTimeout,
    postMessage: (m: { type: string }) => { posts.push(m); },
    addEventListener: (t: string, cb: Listener) => { if (t === 'message') listeners.push(cb); },
    navigator: {},
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(workerBootScript(), sandbox);
  const deliver = (data: unknown) => { for (const cb of listeners) cb({ data }); };
  return { posts, deliver, run: (expr: string) => vm.runInContext(expr, sandbox) as Promise<Record<string, () => Promise<unknown>>> };
}

const bytes = Uint8Array.from([0, 1, 2, 127, 128, 200, 250, 255, 0xc3, 0x28]);

describe('widget nexus.net.fetch Response', () => {
  it('returns the original bytes from arrayBuffer() for a binary envelope', async () => {
    const w = widgetWorker();
    const pending = w.run('nexus.net.fetch("https://tiles.example.com/a.pbf")');
    const req = w.posts.find((p) => p.type === 'nexus.net.fetch')!;
    w.deliver({
      type: 'nexus.reply', id: req.id,
      result: { ok: true, status: 200, statusText: 'OK', headers: {}, bodyBase64: Buffer.from(bytes).toString('base64') },
    });
    const res = await pending;
    const buf = await res.arrayBuffer() as ArrayBuffer;
    expect(new Uint8Array(buf)).toEqual(bytes);
  });

  it('keeps text(), json() and arrayBuffer() working for text and JSON envelopes', async () => {
    const w = widgetWorker();
    const t = w.run('nexus.net.fetch("https://a.example.com/t")');
    w.deliver({ type: 'nexus.reply', id: w.posts[0].id, result: { ok: true, status: 200, headers: {}, bodyText: 'héllo' } });
    const tr = await t;
    expect(await tr.text()).toBe('héllo');
    expect(new TextDecoder().decode(await tr.arrayBuffer() as ArrayBuffer)).toBe('héllo');

    const j = w.run('nexus.net.fetch("https://a.example.com/j")');
    w.deliver({ type: 'nexus.reply', id: w.posts[1].id, result: { ok: true, status: 200, headers: {}, body: { x: 1 } } });
    const jr = await j;
    expect(await jr.json()).toEqual({ x: 1 });
    expect(await jr.text()).toBe('{"x":1}');
  });
});
