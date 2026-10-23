import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchBundleFile = vi.fn();
const fetchServiceBlob = vi.fn();
vi.mock('../../panel/widgets/marketplace/useSdkBundle', () => ({ fetchBundleFile: (...a: unknown[]) => fetchBundleFile(...a) }));
vi.mock('../../api/service', () => ({ fetchServiceBlob: (...a: unknown[]) => fetchServiceBlob(...a) }));

import {
  acquireCanvas, canvasKey, cappedPixelRatio, framePacing, inViewFromEntries, normaliseAssetPath, releaseCanvas,
  type CanvasClaim, type CanvasSpec,
} from '../ui/canvasHost';

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: Array<{ data: Record<string, unknown>; transfer: unknown[] }> = [];
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  terminated = false;
  constructor(public url: string, public options: unknown) { FakeWorker.all.push(this); }
  addEventListener(type: string, cb: (ev: unknown) => void) { (this.listeners[type] ??= []).push(cb); }
  postMessage(data: Record<string, unknown>, transfer: unknown[] = []) { this.posted.push({ data, transfer }); }
  terminate() { this.terminated = true; }
  emit(data: Record<string, unknown>) { for (const cb of this.listeners.message ?? []) cb({ data }); }
  fault() { for (const cb of this.listeners.error ?? []) cb({ message: 'fault' }); }
  sent(type: string) { return this.posted.filter((p) => p.data.type === type).map((p) => p.data); }
}

const spec: CanvasSpec = { appId: 'com.test.app', renderer: 'renderer.mjs', version: '1.0.0' };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function makeWrap(width = 300, height = 150): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}
const claimOf = (over: Partial<CanvasClaim> = {}): CanvasClaim => ({
  interactive: false, props: { n: 1 }, visible: true, onMessage: null, ...over,
});

let keyN = 0;
const freshKey = () => canvasKey(spec, `t${keyN++}`);

async function readySession(over: Partial<CanvasClaim> = {}, wrap = makeWrap()) {
  const key = freshKey();
  const session = acquireCanvas(key, spec, wrap, claimOf(over));
  await flush();
  const worker = FakeWorker.all[FakeWorker.all.length - 1];
  worker.emit({ type: 'booted' });
  worker.emit({ type: 'ready' });
  return { key, session, worker, wrap };
}

beforeEach(() => {
  FakeWorker.all = [];
  fetchBundleFile.mockReset().mockResolvedValue(new Blob(['export {}']));
  fetchServiceBlob.mockReset();
  vi.stubGlobal('Worker', FakeWorker);
  let n = 0;
  URL.createObjectURL = () => `blob:test/${n++}`;
  URL.revokeObjectURL = () => {};
  (HTMLCanvasElement.prototype as unknown as { transferControlToOffscreen: () => unknown }).transferControlToOffscreen = () => ({ offscreen: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('normaliseAssetPath', () => {
  it('accepts bundle-relative paths and keeps a restricted query', () => {
    expect(normaliseAssetPath('assets/a.nxpack')).toEqual({ path: 'assets/a.nxpack', query: '' });
    expect(normaliseAssetPath('assets/ina.nxpack?v=26')).toEqual({ path: 'assets/ina.nxpack', query: '?v=26' });
    expect(normaliseAssetPath('dir/a b.png')?.path).toBe('dir/a%20b.png');
  });
  it('rejects traversal, absolute, scheme, backslash and fragment forms', () => {
    for (const bad of [
      '', '/etc/passwd', '../a', 'a/../b', 'a/..', './a', 'a//b', '%2e%2e/a', 'a/%2E%2E/b', 'a%2Fb/../c', 'a\\b', 'C:/x',
      'https://x/a', 'a#b', 'a\u0000b', 'a%00b', 'a.png?x#y', 'a.png?<script>', 5, null, undefined,
    ]) {
      expect(normaliseAssetPath(bad), String(bad)).toBeNull();
    }
  });
});

describe('helpers', () => {
  it('caps the pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(cappedPixelRatio()).toBe(1.5);
    vi.stubGlobal('devicePixelRatio', 0.5);
    expect(cappedPixelRatio()).toBe(1);
  });
  it('reads the page draw-rate limits from its query', () => {
    expect(framePacing('?displayHz=60')).toEqual({ maxFps: null, displayHz: 60 });
    expect(framePacing('?streamFps=30&displayHz=60')).toEqual({ maxFps: 30, displayHz: 60 });
    expect(framePacing('')).toEqual({ maxFps: null, displayHz: null });
  });

  it('reads the newest intersection record', () => {
    expect(inViewFromEntries([{ isIntersecting: false }, { isIntersecting: true }], false)).toBe(true);
    expect(inViewFromEntries([], true)).toBe(true);
  });
});

describe('CanvasSession protocol', () => {
  it('fetches the renderer for its app, spawns a worker and inits after boot', async () => {
    const wrap = makeWrap(320, 180);
    vi.stubGlobal('devicePixelRatio', 2);
    const session = acquireCanvas(freshKey(), spec, wrap, claimOf({ props: { hello: 'x' } }));
    await flush();
    expect(fetchBundleFile).toHaveBeenCalledWith('com.test.app', 'renderer.mjs', '1.0.0');
    const worker = FakeWorker.all[0];
    expect(worker.options).toMatchObject({ type: 'module' });
    expect(worker.posted).toHaveLength(0);
    expect(session.phase).toBe('loading');
    expect(session.element.style.opacity).toBe('0');

    worker.emit({ type: 'booted' });
    const init = worker.posted[0];
    expect(init.data).toMatchObject({
      type: 'init', size: { width: 320, height: 180, pixelRatio: 1.5 }, props: { hello: 'x' }, visible: true,
      pacing: { maxFps: null, displayHz: null },
    });
    expect(init.transfer).toEqual([{ offscreen: true }]);

    worker.emit({ type: 'ready' });
    expect(session.phase).toBe('ready');
    expect(session.element.style.opacity).toBe('1');
    expect(wrap.contains(session.element)).toBe(true);
  });

  it('sends props only when they change, and only for the holder', async () => {
    const { session, worker, wrap } = await readySession();
    session.update(wrap, { props: { n: 1 } });
    expect(worker.sent('props')).toHaveLength(0);
    session.update(wrap, { props: { n: 2 } });
    expect(worker.sent('props')).toEqual([{ type: 'props', props: { n: 2 } }]);
    const other = makeWrap();
    const key2 = freshKey();
    const s2 = acquireCanvas(key2, spec, other, claimOf());
    s2.update(other, { props: { n: 9 } });
    expect(worker.sent('props')).toHaveLength(1);
  });

  it('resizes with the capped ratio and ignores a non-holder', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { session, worker, wrap } = await readySession();
    Object.defineProperty(wrap, 'clientWidth', { value: 500, configurable: true });
    session.resize(wrap);
    expect(worker.sent('resize')).toEqual([{ type: 'resize', size: { width: 500, height: 150, pixelRatio: 1.5 } }]);
    session.resize(wrap);
    expect(worker.sent('resize')).toHaveLength(1);
    session.resize(makeWrap());
    expect(worker.sent('resize')).toHaveLength(1);
  });

  it('revokes both blob URLs once the renderer has booted', async () => {
    const revoked: string[] = [];
    URL.revokeObjectURL = (u) => { revoked.push(u); };
    const session = acquireCanvas(freshKey(), spec, makeWrap(), claimOf());
    await flush();
    expect(revoked).toHaveLength(0);
    FakeWorker.all[0].emit({ type: 'booted' });
    expect(revoked).toHaveLength(2);
    void session;
  });

  it('keeps sessions of different listing versions apart', () => {
    expect(canvasKey(spec, 's:stage')).not.toBe(canvasKey({ ...spec, version: '2.0.0' }, 's:stage'));
  });

  it('re-sends the size when the pixel ratio changes at the same CSS size', async () => {
    let onChange: (() => void) | null = null;
    vi.stubGlobal('matchMedia', (q: string) => ({
      media: q, matches: false,
      addEventListener: (_t: string, cb: () => void) => { onChange = cb; },
      removeEventListener: () => {},
    }));
    vi.stubGlobal('devicePixelRatio', 1);
    const { worker } = await readySession();
    expect(onChange).not.toBeNull();
    vi.stubGlobal('devicePixelRatio', 2);
    onChange!();
    expect(worker.sent('resize').pop()).toEqual({ type: 'resize', size: { width: 300, height: 150, pixelRatio: 1.5 } });
  });

  it('forwards visibility changes of the holder', async () => {
    const { session, worker, wrap } = await readySession();
    session.update(wrap, { visible: false });
    session.update(wrap, { visible: false });
    session.update(wrap, { visible: true });
    expect(worker.sent('visible')).toEqual([{ type: 'visible', visible: false }, { type: 'visible', visible: true }]);
  });

  it('routes renderer posts to the holder only', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const { key, worker, wrap } = await readySession({ onMessage: a });
    const second = makeWrap();
    acquireCanvas(key, spec, second, claimOf({ onMessage: b }));
    worker.emit({ type: 'post', data: { k: 1 } });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith({ k: 1 });
    void wrap;
  });
});

describe('sharing and reparenting', () => {
  it('shares one worker per key, moves the canvas to the newest mount and hands it back', async () => {
    const { key, session, worker, wrap } = await readySession({ props: { who: 'tile' } });
    const overlay = makeWrap(800, 600);
    const again = acquireCanvas(key, spec, overlay, claimOf({ props: { who: 'overlay' } }));
    expect(again).toBe(session);
    expect(FakeWorker.all).toHaveLength(1);
    expect(overlay.contains(session.element)).toBe(true);
    expect(session.isHolder(overlay)).toBe(true);
    expect(worker.sent('props').pop()).toEqual({ type: 'props', props: { who: 'overlay' } });
    expect(worker.sent('resize').pop()).toMatchObject({ size: { width: 800, height: 600 } });

    releaseCanvas(key, session, overlay);
    expect(wrap.contains(session.element)).toBe(true);
    expect(worker.sent('props').pop()).toEqual({ type: 'props', props: { who: 'tile' } });
    expect(worker.sent('resize').pop()).toMatchObject({ size: { width: 300, height: 150 } });
  });

  it('keeps the worker through the grace window and disposes after it', async () => {
    vi.useFakeTimers();
    const wrap = makeWrap();
    const key = freshKey();
    const session = acquireCanvas(key, spec, wrap, claimOf());
    await vi.advanceTimersByTimeAsync(0);
    const worker = FakeWorker.all[0];
    releaseCanvas(key, session, wrap);
    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.terminated).toBe(false);
    const remount = acquireCanvas(key, spec, makeWrap(), claimOf());
    expect(remount).toBe(session);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(worker.terminated).toBe(false);
    releaseCanvas(key, session, wrap);
    releaseCanvas(key, session, [...document.body.children].pop() as HTMLElement);
    await vi.advanceTimersByTimeAsync(6000);
    expect(worker.terminated).toBe(true);
    expect(acquireCanvas(key, spec, makeWrap(), claimOf())).not.toBe(session);
  });
});

describe('pointer forwarding', () => {
  function pointer(type: string, init: Record<string, unknown> = {}) {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    Object.assign(ev, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30, buttons: 1, ...init });
    return ev;
  }
  const fire = (session: { element: HTMLElement }, ev: Event) => (session.element.firstElementChild as HTMLElement).dispatchEvent(ev);

  it('forwards canvas-relative coordinates only to an interactive holder', async () => {
    const { session, worker, wrap } = await readySession({ interactive: false });
    const canvas = session.element.firstElementChild as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 150 }) as DOMRect;
    Object.defineProperty(canvas, 'clientWidth', { value: 300 });
    Object.defineProperty(canvas, 'clientHeight', { value: 150 });

    fire(session, pointer('pointerdown'));
    expect(worker.sent('pointer')).toHaveLength(0);
    expect(canvas.style.pointerEvents).toBe('none');

    session.update(wrap, { interactive: true });
    expect(canvas.style.pointerEvents).toBe('auto');
    fire(session, pointer('pointerdown'));
    fire(session, pointer('pointermove', { buttons: 0 }));
    fire(session, pointer('pointerup', { buttons: 0 }));
    expect(worker.sent('pointer').map((m) => (m.event as { type: string }).type)).toEqual(['down', 'move', 'up']);
    expect(worker.sent('pointer')[0].event).toMatchObject({ pointerId: 1, pointerType: 'mouse', x: 30, y: 10, buttons: 1 });
  });

  it('a non-holder claim never forwards and the canvas follows the holder state', async () => {
    const { key, session, worker, wrap } = await readySession({ interactive: true });
    const overlay = makeWrap();
    acquireCanvas(key, spec, overlay, claimOf({ interactive: false }));
    const canvas = session.element.firstElementChild as HTMLElement;
    expect(canvas.style.pointerEvents).toBe('none');
    fire(session, pointer('pointerdown'));
    expect(worker.sent('pointer')).toHaveLength(0);
    releaseCanvas(key, session, overlay);
    expect(canvas.style.pointerEvents).toBe('auto');
    void wrap;
  });

  it('withholds pointers while a layer gesture is live, through to their release', async () => {
    const { session, worker } = await readySession({ interactive: true });
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    layer.appendChild(session.element);
    layer.setAttribute('data-layer-gesture-live', 'true');
    fire(session, pointer('pointerdown', { pointerId: 7 }));
    layer.removeAttribute('data-layer-gesture-live');
    fire(session, pointer('pointermove', { pointerId: 7 }));
    fire(session, pointer('pointerup', { pointerId: 7 }));
    expect(worker.sent('pointer')).toHaveLength(0);
    fire(session, pointer('pointerdown', { pointerId: 8 }));
    expect(worker.sent('pointer')).toHaveLength(1);
  });

  it('forwards wheel and prevents page scroll while interactive', async () => {
    const { session, worker, wrap } = await readySession({ interactive: false });
    const wheel = () => Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), { clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0, buttons: 0 });
    const off = wheel();
    fire(session, off);
    expect(off.defaultPrevented).toBe(false);
    session.update(wrap, { interactive: true });
    const on = wheel();
    fire(session, on);
    expect(on.defaultPrevented).toBe(true);
    expect(worker.sent('pointer')[0].event).toMatchObject({ type: 'wheel', deltaY: 120, deltaMode: 0 });
  });
});

describe('pointer lifecycle', () => {
  function ptr(type: string, init: Record<string, unknown> = {}) {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    Object.assign(ev, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, buttons: 1, ...init });
    return ev;
  }
  const types = (w: FakeWorker) => w.sent('pointer').map((m) => (m.event as { type: string }).type);

  it('keeps forwarding a forwarded pointer after a layer gesture goes live or input is switched off', async () => {
    const { session, worker, wrap } = await readySession({ interactive: true });
    const canvas = session.element.firstElementChild as HTMLElement;
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    layer.appendChild(session.element);
    canvas.dispatchEvent(ptr('pointerdown'));
    layer.setAttribute('data-layer-gesture-live', 'true');
    canvas.dispatchEvent(ptr('pointermove'));
    session.update(wrap, { interactive: false });
    canvas.dispatchEvent(ptr('pointerup'));
    expect(types(worker)).toEqual(['down', 'move', 'up']);
    canvas.dispatchEvent(ptr('pointermove'));
    expect(types(worker)).toHaveLength(3);
  });

  it('cancels forwarded pointers when the canvas moves to another holder', async () => {
    const { key, session, worker } = await readySession({ interactive: true });
    const canvas = session.element.firstElementChild as HTMLElement;
    canvas.dispatchEvent(ptr('pointerdown', { pointerId: 3 }));
    acquireCanvas(key, spec, makeWrap(), claimOf());
    expect(worker.sent('pointer').pop()?.event).toMatchObject({ type: 'cancel', pointerId: 3 });
    canvas.dispatchEvent(ptr('pointerup', { pointerId: 3 }));
    expect(types(worker)).toEqual(['down', 'cancel']);
  });

  it('cancels a forwarded pointer whose capture is lost', async () => {
    const { session, worker } = await readySession({ interactive: true });
    const canvas = session.element.firstElementChild as HTMLElement;
    canvas.dispatchEvent(ptr('pointerdown', { pointerId: 5 }));
    canvas.dispatchEvent(ptr('lostpointercapture', { pointerId: 5 }));
    expect(types(worker)).toEqual(['down', 'cancel']);
    canvas.dispatchEvent(ptr('lostpointercapture', { pointerId: 5 }));
    expect(types(worker)).toHaveLength(2);
  });

  it('does not carry a pointer of a dead worker over to its replacement', async () => {
    const { session, worker } = await readySession({ interactive: true });
    const canvas = session.element.firstElementChild as HTMLElement;
    canvas.dispatchEvent(ptr('pointerdown'));
    worker.fault();
    await flush();
    const next = FakeWorker.all[1];
    next.emit({ type: 'booted' });
    next.emit({ type: 'ready' });
    const fresh = session.element.firstElementChild as HTMLElement;
    fresh.dispatchEvent(ptr('pointerup'));
    expect(types(next)).toEqual([]);
  });

  it('a normal release does not add a cancel', async () => {
    const { session, worker } = await readySession({ interactive: true });
    const canvas = session.element.firstElementChild as HTMLElement;
    canvas.dispatchEvent(ptr('pointerdown'));
    canvas.dispatchEvent(ptr('pointerup'));
    canvas.dispatchEvent(ptr('lostpointercapture'));
    expect(types(worker)).toEqual(['down', 'up']);
  });
});

describe('readAsset', () => {
  it('serves a bundle path of this app and transfers the bytes', async () => {
    const { worker } = await readySession();
    fetchServiceBlob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
    worker.emit({ type: 'read-asset', id: 4, path: 'assets/ina.nxpack?v=26' });
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchServiceBlob).toHaveBeenCalledWith('/apps-api/installed/com.test.app/asset/assets/ina.nxpack?v=26');
    const result = worker.posted.find((p) => p.data.type === 'asset-result')!;
    expect(result.data.id).toBe(4);
    expect(result.transfer).toHaveLength(1);
    expect(new Uint8Array(result.data.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects paths that escape the bundle without any request', async () => {
    const { worker } = await readySession();
    for (const [id, path] of [[1, '../other.app/x.png'], [2, '/apps-api/installed/other/asset/x.png'], [3, 'a/%2e%2e/b.png']] as const) {
      worker.emit({ type: 'read-asset', id, path });
    }
    await flush();
    expect(fetchServiceBlob).not.toHaveBeenCalled();
    expect(worker.sent('asset-error').map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('reports a missing asset', async () => {
    const { worker } = await readySession();
    fetchServiceBlob.mockResolvedValue(null);
    worker.emit({ type: 'read-asset', id: 9, path: 'nope.png' });
    await flush();
    expect(worker.sent('asset-error')).toEqual([{ type: 'asset-error', id: 9, message: 'asset not found' }]);
  });
});

describe('failure handling', () => {
  it('goes to the error state when the renderer cannot be fetched', async () => {
    fetchBundleFile.mockResolvedValue(null);
    const session = acquireCanvas(freshKey(), spec, makeWrap(), claimOf());
    await flush();
    expect(session.phase).toBe('error');
    expect(FakeWorker.all).toHaveLength(0);
  });

  it('refuses a renderer path that escapes the bundle', async () => {
    const session = acquireCanvas(canvasKey({ ...spec, renderer: '../x.mjs' }, 'bad'), { ...spec, renderer: '../x.mjs' }, makeWrap(), claimOf());
    await flush();
    expect(session.phase).toBe('error');
    expect(fetchBundleFile).not.toHaveBeenCalled();
  });

  it('respawns once on a worker fault with a fresh canvas, then errors', async () => {
    const { session, worker } = await readySession();
    const firstCanvas = session.element.firstElementChild;
    worker.fault();
    expect(worker.terminated).toBe(true);
    expect(session.phase).toBe('loading');
    await flush();
    expect(FakeWorker.all).toHaveLength(2);
    expect(session.element.firstElementChild).not.toBe(firstCanvas);
    const second = FakeWorker.all[1];
    second.fault();
    expect(session.phase).toBe('error');
    expect(FakeWorker.all).toHaveLength(2);
  });

  it('a renderer error before ready counts as a fault', async () => {
    const wrap = makeWrap();
    const session = acquireCanvas(freshKey(), spec, wrap, claimOf());
    await flush();
    FakeWorker.all[0].emit({ type: 'booted' });
    FakeWorker.all[0].emit({ type: 'error', message: 'no webgl' });
    await flush();
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[1].emit({ type: 'booted' });
    FakeWorker.all[1].emit({ type: 'error', message: 'no webgl' });
    expect(session.phase).toBe('error');
  });

  it('errors when the worker never boots', async () => {
    vi.useFakeTimers();
    const session = acquireCanvas(freshKey(), spec, makeWrap(), claimOf());
    await vi.advanceTimersByTimeAsync(21_000);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(session.phase).toBe('error');
  });
});
