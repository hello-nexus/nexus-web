// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  MAX_FRAME_DT, runRenderer, type HostToRenderer, type RendererContext, type RendererPort, type RendererToHost,
} from '../../../sdk/runtime/rendererCore';

function fakePort() {
  const sent: RendererToHost[] = [];
  let listener: ((ev: { data: HostToRenderer }) => void) | null = null;
  const frames: Array<(now: number) => void> = [];
  const port: RendererPort = {
    postMessage: (m) => { sent.push(m); },
    addEventListener: (_t, l) => { listener = l; },
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelAnimationFrame: (h) => { frames[h - 1] = () => {}; },
  };
  const deliver = (data: HostToRenderer) => listener!({ data });
  const canvas = { width: 0, height: 0 } as unknown as OffscreenCanvas;
  const init = (over: Partial<Extract<HostToRenderer, { type: 'init' }>> = {}) => deliver({
    type: 'init', canvas, size: { width: 200, height: 100, pixelRatio: 1.5 }, props: { a: 1 }, visible: true, ...over,
  });
  const runFrame = (now: number) => { const cb = frames.pop(); cb?.(now); };
  return { port, sent, deliver, init, canvas, frames, runFrame };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('runRenderer protocol', () => {
  it('announces itself, then starts with the transferred canvas, size and props', async () => {
    const h = fakePort();
    const start = vi.fn((ctx: RendererContext) => { void ctx; });
    runRenderer(start, h.port);
    expect(h.sent).toEqual([{ type: 'booted' }]);
    h.init();
    await flush();
    const ctx = start.mock.calls[0][0];
    expect(ctx.canvas).toBe(h.canvas);
    expect(ctx.props).toEqual({ a: 1 });
    expect(ctx.size).toEqual({ width: 200, height: 100, pixelRatio: 1.5 });
    expect(h.canvas.width).toBe(300);
    expect(h.canvas.height).toBe(150);
  });

  it('ignores a second init', () => {
    const h = fakePort();
    const start = vi.fn();
    runRenderer(start, h.port);
    h.init();
    h.init();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('props update the context and notify callbacks', () => {
    const h = fakePort();
    let ctx!: RendererContext;
    const onProps = vi.fn();
    runRenderer((c) => { ctx = c; c.onProps(onProps); }, h.port);
    h.init();
    h.deliver({ type: 'props', props: { b: 2 } });
    expect(ctx.props).toEqual({ b: 2 });
    expect(onProps).toHaveBeenCalledWith({ b: 2 });
  });

  it('resizes the backing store before calling onResize', () => {
    const h = fakePort();
    const seen: Array<[number, number]> = [];
    runRenderer((c) => { c.onResize(() => seen.push([h.canvas.width, h.canvas.height])); }, h.port);
    h.init();
    h.deliver({ type: 'resize', size: { width: 400, height: 50, pixelRatio: 1 } });
    expect(seen).toEqual([[400, 50]]);
  });

  it('forwards pointer events', () => {
    const h = fakePort();
    const cb = vi.fn();
    runRenderer((c) => { c.onPointer(cb); }, h.port);
    h.init();
    const event = { type: 'down', pointerId: 1, pointerType: 'touch', x: 3, y: 4, buttons: 1 } as const;
    h.deliver({ type: 'pointer', event });
    expect(cb).toHaveBeenCalledWith(event);
  });

  it('runs frames only while visible and caps dt', async () => {
    const h = fakePort();
    const frame = vi.fn();
    runRenderer((c) => { c.onFrame(frame); }, h.port);
    h.init();
    await flush();
    h.runFrame(1000);
    h.runFrame(1016);
    expect(frame.mock.calls[1][0]).toBeCloseTo(0.016, 5);
    h.runFrame(9000);
    expect(frame.mock.calls[2][0]).toBe(MAX_FRAME_DT);

    const before = frame.mock.calls.length;
    h.deliver({ type: 'visible', visible: false });
    h.runFrame(9100);
    expect(frame.mock.calls.length).toBe(before);

    h.deliver({ type: 'visible', visible: true });
    h.runFrame(9200);
    expect(frame.mock.calls.length).toBe(before + 1);
    expect(frame.mock.calls[before][0]).toBe(0);
  });

  it('draws no faster than the panel refresh, with dt spanning the skipped ticks', async () => {
    const h = fakePort();
    const frame = vi.fn();
    runRenderer((c) => { c.onFrame(frame); }, h.port);
    h.init({ pacing: { maxFps: null, displayHz: 60 } });
    await flush();
    const tickMs = 1000 / 144;
    for (let i = 0; i < 144; i++) h.runFrame(1000 + i * tickMs);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(60);
    expect(frame.mock.calls.length).toBeLessThan(80);
    expect(frame.mock.calls[frame.mock.calls.length - 1][0]).toBeCloseTo((2 * tickMs) / 1000, 5);
  });

  it('a stream cap wins over the panel refresh', async () => {
    const h = fakePort();
    const frame = vi.fn();
    runRenderer((c) => { c.onFrame(frame); }, h.port);
    h.init({ pacing: { maxFps: 30, displayHz: 60 } });
    await flush();
    for (let i = 0; i < 144; i++) h.runFrame(1000 + i * (1000 / 144));
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it('starts hidden without scheduling frames', async () => {
    const h = fakePort();
    const frame = vi.fn();
    runRenderer((c) => { c.onFrame(frame); }, h.port);
    h.init({ visible: false });
    await flush();
    expect(h.frames.length).toBe(0);
  });

  it('notifies visibility changes only on change', () => {
    const h = fakePort();
    const cb = vi.fn();
    runRenderer((c) => { c.onVisibility(cb); }, h.port);
    h.init();
    h.deliver({ type: 'visible', visible: true });
    h.deliver({ type: 'visible', visible: false });
    expect(cb.mock.calls).toEqual([[false]]);
  });

  it('readAsset resolves and rejects by request id', async () => {
    const h = fakePort();
    let ctx!: RendererContext;
    runRenderer((c) => { ctx = c; }, h.port);
    h.init();
    const ok = ctx.readAsset('a.bin');
    const bad = ctx.readAsset('b.bin');
    const reqs = h.sent.filter((m) => m.type === 'read-asset') as Array<Extract<RendererToHost, { type: 'read-asset' }>>;
    expect(reqs.map((r) => r.path)).toEqual(['a.bin', 'b.bin']);
    const buf = new ArrayBuffer(4);
    h.deliver({ type: 'asset-error', id: reqs[1].id, message: 'asset not found' });
    h.deliver({ type: 'asset-result', id: reqs[0].id, data: buf });
    await expect(ok).resolves.toBe(buf);
    await expect(bad).rejects.toThrow('asset not found');
  });

  it('post and ready reach the host', () => {
    const h = fakePort();
    runRenderer((c) => { c.post({ n: 1 }); c.ready(); }, h.port);
    h.init();
    expect(h.sent).toContainEqual({ type: 'post', data: { n: 1 } });
    expect(h.sent).toContainEqual({ type: 'ready' });
  });

  it('reports a throwing start and a rejecting start as errors', async () => {
    const a = fakePort();
    runRenderer(() => { throw new Error('boom'); }, a.port);
    a.init();
    expect(a.sent).toContainEqual({ type: 'error', message: 'boom' });
    const b = fakePort();
    runRenderer(async () => { throw new Error('later'); }, b.port);
    b.init();
    await flush();
    expect(b.sent).toContainEqual({ type: 'error', message: 'later' });
  });

  it('a throwing callback is reported and does not stop others', () => {
    const h = fakePort();
    const second = vi.fn();
    runRenderer((c) => { c.onProps(() => { throw new Error('cb'); }); c.onProps(second); }, h.port);
    h.init();
    h.deliver({ type: 'props', props: {} });
    expect(h.sent).toContainEqual({ type: 'error', message: 'cb' });
    expect(second).toHaveBeenCalled();
  });
});
