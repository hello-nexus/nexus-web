import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebViewHost } from './webViewHost';
import type { WebViewSync } from './webViewProtocol';

type TestWindow = Window & { chrome?: unknown };

class FakeWebView2 extends EventTarget {
  postMessage = vi.fn();
  push(data: unknown) { this.dispatchEvent(Object.assign(new Event('message'), { data })); }
}

const caps = (over: Record<string, unknown> = {}) => ({
  type: 'nexus.webview.caps', version: 1, supported: true, maxViews: 4, interactive: true, ...over,
});

let bridge: FakeWebView2;
let hosts: WebViewHost[] = [];
let covered = false;

function makeHost() {
  const h = new WebViewHost();
  hosts.push(h);
  return h;
}

function makeEl(rect = { x: 10, y: 20, w: 300, h: 300 }) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    left: rect.x, top: rect.y, width: rect.w, height: rect.h,
    right: rect.x + rect.w, bottom: rect.y + rect.h, x: rect.x, y: rect.y, toJSON: () => ({}),
  });
  document.body.appendChild(el);
  return { el, moveTo(next: typeof rect) { rect = next; } };
}

function syncs(): WebViewSync[] {
  return bridge.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'nexus.webview.sync');
}

const frame = () => vi.advanceTimersByTime(20);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  bridge = new FakeWebView2();
  (window as TestWindow).chrome = { webview: bridge };
  covered = false;
  // jsdom has no layout; the hit test returns the last element in the body (the topmost overlay) unless covered.
  document.elementFromPoint = (x: number, y: number) => {
    void x; void y;
    return covered ? document.documentElement : (Array.from(document.body.querySelectorAll('div')).pop() ?? null);
  };
});

afterEach(() => {
  for (const h of hosts) h.dispose();
  hosts = [];
  delete (window as TestWindow).chrome;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('capability handshake', () => {
  it('is unsupported at once with no transport and sends nothing', () => {
    delete (window as TestWindow).chrome;
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    expect(host.getSnapshot().status).toBe('unsupported');
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('sends hello once on the first claim', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    host.register({ id: 'b', url: 'https://b.test/', element: makeEl().el, immersive: false });
    const hellos = bridge.postMessage.mock.calls.filter(c => c[0].type === 'nexus.webview.hello');
    expect(hellos).toHaveLength(1);
    expect(hellos[0][0]).toEqual({ type: 'nexus.webview.hello', version: 1 });
    expect(host.getSnapshot().status).toBe('pending');
  });

  it('treats no caps within 1500 ms as unsupported, and still accepts a late caps', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    vi.advanceTimersByTime(1499);
    expect(host.getSnapshot().status).toBe('pending');
    vi.advanceTimersByTime(2);
    expect(host.getSnapshot().status).toBe('unsupported');
    bridge.push(caps());
    expect(host.getSnapshot().status).toBe('supported');
  });

  it('sends no sync before caps arrive', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    vi.advanceTimersByTime(1400);
    expect(syncs()).toHaveLength(0);
  });

  it('reads caps from the CustomEvent path too', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    window.dispatchEvent(new CustomEvent('nexus-webview', { detail: caps({ interactive: false }) }));
    expect(host.getSnapshot()).toMatchObject({ status: 'supported', interactive: false });
  });
});

describe('sync stream', () => {
  it('sends the full view on caps with monotonically increasing seq', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    const [first] = syncs();
    expect(first.views).toEqual([{
      id: 'a', url: 'https://a.test/', rect: { x: 10, y: 20, w: 300, h: 300 }, radius: 0, zoom: 1, interactive: false, visible: true,
    }]);
    expect(first.viewport).toEqual({ w: window.innerWidth, h: window.innerHeight });
    vi.advanceTimersByTime(2500);
    const seqs = syncs().map(s => s.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('does not resend an unchanged layout on a frame, but does on a change', () => {
    const host = makeHost();
    const a = makeEl();
    host.register({ id: 'a', url: 'https://a.test/', element: a.el, immersive: false });
    bridge.push(caps());
    const before = syncs().length;
    window.dispatchEvent(new Event('resize'));
    frame();
    expect(syncs()).toHaveLength(before);
    a.moveTo({ x: 50, y: 60, w: 300, h: 300 });
    window.dispatchEvent(new Event('resize'));
    frame();
    expect(syncs()).toHaveLength(before + 1);
    expect(syncs().at(-1)!.views[0].rect.x).toBe(50);
  });

  it('coalesces several triggers in one frame into one sync', () => {
    const host = makeHost();
    const a = makeEl();
    host.register({ id: 'a', url: 'https://a.test/', element: a.el, immersive: false });
    bridge.push(caps());
    const before = syncs().length;
    a.moveTo({ x: 1, y: 1, w: 300, h: 300 });
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    host.setSuppressed(true);
    host.setSuppressed(false);
    frame();
    expect(syncs()).toHaveLength(before + 1);
  });

  it('heartbeats every 1000 ms even when nothing changed', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    const before = syncs().length;
    vi.advanceTimersByTime(1000);
    expect(syncs()).toHaveLength(before + 1);
    vi.advanceTimersByTime(1000);
    expect(syncs()).toHaveLength(before + 2);
    expect(syncs().at(-1)!.views).toEqual(syncs().at(-2)!.views);
  });

  it('hides the view while suppressed, covered, or the document is hidden', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0].visible).toBe(true);

    host.setSuppressed(true);
    frame();
    expect(syncs().at(-1)!.views[0].visible).toBe(false);
    host.setSuppressed(false);
    frame();
    expect(syncs().at(-1)!.views[0].visible).toBe(true);

    covered = true;
    vi.advanceTimersByTime(1000);
    expect(syncs().at(-1)!.views[0].visible).toBe(false);
    covered = false;

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(syncs().at(-1)!.views[0].visible).toBe(false);
    spy.mockRestore();
  });

  it('keeps layout fresh through a transition burst', () => {
    const host = makeHost();
    const a = makeEl();
    host.register({ id: 'a', url: 'https://a.test/', element: a.el, immersive: false });
    bridge.push(caps());
    window.dispatchEvent(new Event('transitionrun'));
    a.moveTo({ x: 10, y: 100, w: 300, h: 300 });
    frame();
    a.moveTo({ x: 10, y: 200, w: 300, h: 300 });
    frame();
    expect(syncs().at(-1)!.views[0].rect.y).toBe(200);
  });

  it('is not interactive on a tile, and never on a host that reports interactive false', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: true });
    bridge.push(caps({ interactive: false }));
    expect(syncs().at(-1)!.views[0].interactive).toBe(false);
  });
});

describe('card geometry', () => {
  it('sends the card content box and radius, and treats the card as the hit target', () => {
    const host = makeHost();
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.style.borderTopLeftRadius = '16px';
    card.getBoundingClientRect = () => ({
      left: 15, top: 10, width: 704, height: 500, right: 719, bottom: 510, x: 15, y: 10, toJSON: () => ({}),
    });
    const scaler = makeEl({ x: 0, y: 10, w: 734, h: 500 }).el;
    card.appendChild(scaler);
    document.body.appendChild(card);
    document.elementFromPoint = () => scaler;
    host.register({ id: 'a', url: 'https://a.test/', element: scaler, immersive: false });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0]).toMatchObject({ rect: { x: 15, y: 10, w: 704, h: 500 }, radius: 16, visible: true });
  });

  it('is square with no card (immersive)', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: true });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0].radius).toBe(0);
  });
});

describe('state and commands', () => {
  it('stores state frames from both delivery paths', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'loaded', canGoBack: true });
    expect(host.getSnapshot().views.a).toMatchObject({ state: 'loaded', canGoBack: true });
    window.dispatchEvent(new CustomEvent('nexus-webview', { detail: { type: 'nexus.webview.state', id: 'a', state: 'loading', canGoBack: false } }));
    expect(host.getSnapshot().views.a.state).toBe('loading');
  });

  it('hides a failed view so the retry placeholder shows', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'error', code: 'dns', canGoBack: false });
    frame();
    expect(syncs().at(-1)!.views[0].visible).toBe(false);
  });

  it('sends commands, and reload clears a failed state locally', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: true });
    bridge.push(caps());
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'crashed', canGoBack: false });
    host.sendCommand('a', 'back');
    host.sendCommand('a', 'reload');
    const cmds = bridge.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'nexus.webview.command');
    expect(cmds).toEqual([
      { type: 'nexus.webview.command', id: 'a', command: 'back' },
      { type: 'nexus.webview.command', id: 'a', command: 'reload' },
    ]);
    expect(host.getSnapshot().views.a.state).toBe('loading');
  });

  it('drops commands on an unsupported host', () => {
    delete (window as TestWindow).chrome;
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    host.sendCommand('a', 'reload');
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });
});

describe('teardown', () => {
  it('sends views: [] on pagehide and resumes on pageshow', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    window.dispatchEvent(new Event('pagehide'));
    expect(syncs().at(-1)!.views).toEqual([]);
    const n = syncs().length;
    vi.advanceTimersByTime(2000);
    expect(syncs()).toHaveLength(n);
    window.dispatchEvent(new Event('pageshow'));
    expect(syncs().at(-1)!.views).toHaveLength(1);
  });

  it('sends views: [] when the last claim is released, then stops the heartbeat', () => {
    const host = makeHost();
    const claim = host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    claim.release();
    frame();
    expect(syncs().at(-1)!.views).toEqual([]);
    const n = syncs().length;
    vi.advanceTimersByTime(5000);
    expect(syncs()).toHaveLength(n);
  });
});

describe('tile to immersive to tile', () => {
  it('keeps the id and url in every sync across the whole transition', () => {
    const host = makeHost();
    const url = 'https://keep.test/page';
    const tile = makeEl({ x: 10, y: 20, w: 300, h: 300 });
    const immersive = makeEl({ x: 0, y: 44, w: 800, h: 1100 });

    const tileClaim = host.register({ id: 'w1', url, element: tile.el, immersive: false });
    bridge.push(caps());

    // Open: the immersive claim mounts while the tile is still mounted.
    const immersiveClaim = host.register({ id: 'w1', url, element: immersive.el, immersive: true });
    frame();
    const open = syncs().at(-1)!;
    expect(open.views).toHaveLength(1);
    expect(open.views[0]).toMatchObject({ id: 'w1', url, interactive: true, visible: true, rect: { x: 0, y: 44, w: 800, h: 1100 } });

    // Close: the immersive claim goes away and the tile's rect takes over again.
    immersiveClaim.release();
    immersive.el.remove();
    vi.advanceTimersByTime(1000);
    const closed = syncs().at(-1)!;
    expect(closed.views[0]).toMatchObject({ id: 'w1', url, interactive: false, visible: true, rect: { x: 10, y: 20, w: 300, h: 300 } });

    // Even a tile remount at the swap point leaves no gap.
    const remount = host.register({ id: 'w1', url, element: tile.el, immersive: false });
    tileClaim.release();
    frame();
    remount.release();
    host.register({ id: 'w1', url, element: tile.el, immersive: false });
    frame();

    const all = syncs();
    expect(all.length).toBeGreaterThan(2);
    for (const s of all) {
      expect(s.views.map(v => v.id)).toEqual(['w1']);
      expect(s.views[0].url).toBe(url);
    }
    // A single hello, and no empty sync, over the whole run.
    expect(bridge.postMessage.mock.calls.filter(c => c[0].type === 'nexus.webview.hello')).toHaveLength(1);
  });

  it('hands the rect to the immersive claim even when the tile is covered by the overlay', () => {
    const host = makeHost();
    const url = 'https://keep.test/';
    host.register({ id: 'w1', url, element: makeEl().el, immersive: false });
    bridge.push(caps());
    host.register({ id: 'w1', url, element: makeEl({ x: 0, y: 44, w: 500, h: 500 }).el, immersive: true });
    frame();
    const view = syncs().at(-1)!.views[0];
    expect(view.rect.y).toBe(44);
    expect(view.interactive).toBe(true);
  });

  it('resends a different url only when the configured url changes', () => {
    const host = makeHost();
    const claim = host.register({ id: 'w1', url: 'https://one.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    claim.setUrl('https://two.test/');
    frame();
    expect(syncs().at(-1)!.views[0].url).toBe('https://two.test/');
  });
});

describe('zoom', () => {
  it('sends a clamped zoom on every view and changes only that field', () => {
    const host = makeHost();
    const claim = host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false, zoom: 9 });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0].zoom).toBe(3);
    const before = syncs().at(-1)!.views[0];
    claim.setZoom(0.05);
    frame();
    const after = syncs().at(-1)!.views[0];
    expect(after.zoom).toBe(0.25);
    expect({ ...after, zoom: 0 }).toEqual({ ...before, zoom: 0 });
    const cmds = bridge.postMessage.mock.calls.filter(c => c[0].type === 'nexus.webview.command');
    expect(cmds).toHaveLength(0);
  });

  it('defaults to 1', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0].zoom).toBe(1);
  });
});

describe('auto-refresh timer', () => {
  const reloads = () => bridge.postMessage.mock.calls
    .map(c => c[0]).filter(m => m.type === 'nexus.webview.command' && m.command === 'reload');
  const min = (n: number) => vi.advanceTimersByTime(n * 60_000);
  const tile = (host: WebViewHost, refreshMinutes = 1) =>
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false, refreshMinutes });

  it('reloads every N minutes while a tile on a supported host', () => {
    const host = makeHost();
    tile(host, 5);
    bridge.push(caps());
    min(4);
    expect(reloads()).toHaveLength(0);
    min(1);
    expect(reloads()).toHaveLength(1);
    min(5);
    expect(reloads()).toHaveLength(2);
  });

  it('is off at 0 and before the host is supported', () => {
    const host = makeHost();
    tile(host, 0);
    bridge.push(caps());
    min(120);
    expect(reloads()).toHaveLength(0);
    const host2 = makeHost();
    delete (window as TestWindow).chrome;
    tile(host2, 1);
    min(10);
    expect(reloads()).toHaveLength(0);
  });

  it('never fires while immersive is open and restarts the full interval on close', () => {
    const host = makeHost();
    tile(host, 1);
    bridge.push(caps());
    min(0.5);
    const imm = host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: true });
    min(10);
    expect(reloads()).toHaveLength(0);
    imm.release();
    min(0.9);
    expect(reloads()).toHaveLength(0);
    min(0.1);
    expect(reloads()).toHaveLength(1);
  });

  it('stops on error or crash and resumes after the view recovers', () => {
    const host = makeHost();
    tile(host, 1);
    bridge.push(caps());
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'error', canGoBack: false });
    min(5);
    expect(reloads()).toHaveLength(0);
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'crashed', canGoBack: false });
    min(5);
    expect(reloads()).toHaveLength(0);
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'loaded', canGoBack: false });
    min(1);
    expect(reloads()).toHaveLength(1);
  });

  it('does not postpone the timer on unrelated updates, and stops when released', () => {
    const host = makeHost();
    const claim = tile(host, 1);
    bridge.push(caps());
    min(0.5);
    bridge.push({ type: 'nexus.webview.state', id: 'a', state: 'loaded', canGoBack: true });
    claim.setZoom(2);
    min(0.5);
    expect(reloads()).toHaveLength(1);
    claim.release();
    min(5);
    expect(reloads()).toHaveLength(1);
  });
});

function pointer(type: string, x: number, y: number, id = 1) {
  window.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: id }));
}

describe('finger-driven moves', () => {
  it('re-measures on pointermove while a pointer is down', () => {
    const host = makeHost();
    const a = makeEl();
    host.register({ id: 'a', url: 'https://a.test/', element: a.el, immersive: false });
    bridge.push(caps());
    pointer('pointerdown', 100, 100);
    a.moveTo({ x: 40, y: 20, w: 300, h: 300 });
    pointer('pointermove', 102, 100);
    frame();
    expect(syncs().at(-1)!.views[0].rect.x).toBe(40);
  });

  it('ignores pointermove with no pointer down', () => {
    const host = makeHost();
    const a = makeEl();
    host.register({ id: 'a', url: 'https://a.test/', element: a.el, immersive: false });
    bridge.push(caps());
    frame();
    const n = syncs().length;
    a.moveTo({ x: 70, y: 20, w: 300, h: 300 });
    pointer('pointermove', 300, 300);
    frame();
    expect(syncs()).toHaveLength(n);
  });

  it('hides tiles at once when a drag starts, keeps immersive, and shows again after release', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    host.register({ id: 'b', url: 'https://b.test/', element: makeEl({ x: 0, y: 0, w: 400, h: 400 }).el, immersive: true });
    bridge.push(caps());
    document.elementFromPoint = () => document.body.querySelector('div');
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 100, 140);
    const during = syncs().at(-1)!;
    expect(during.views.find(v => v.id === 'a')!.visible).toBe(false);
    pointer('pointerup', 100, 140);
    vi.advanceTimersByTime(40);
    expect(syncs().at(-1)!.views.find(v => v.id === 'a')!.visible).toBe(true);
  });

  it('hides every view while a click-through cover layer is in the document', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: true });
    bridge.push(caps());
    expect(syncs().at(-1)!.views[0].visible).toBe(true);
    const hint = document.createElement('span');
    hint.setAttribute('data-webview-cover', '');
    document.body.appendChild(hint);
    vi.advanceTimersByTime(1000);
    expect(syncs().at(-1)!.views[0].visible).toBe(false);
    hint.remove();
    vi.advanceTimersByTime(1000);
    expect(syncs().at(-1)!.views[0].visible).toBe(true);
  });
});

describe('view limit and stable slots', () => {
  const reg = (host: WebViewHost, id: string, immersive = false) =>
    host.register({ id, url: `https://${id}.test/`, element: makeEl().el, immersive });

  it('never syncs widgets past maxViews and reports them over the limit', () => {
    const host = makeHost();
    reg(host, 'a'); reg(host, 'b'); reg(host, 'c');
    bridge.push(caps({ maxViews: 2 }));
    expect(syncs().at(-1)!.views.map(v => v.id)).toEqual(['a', 'b']);
    expect(host.getSnapshot().overLimit).toEqual(['c']);
  });

  it('defaults the limit to 4', () => {
    const host = makeHost();
    ['a', 'b', 'c', 'd', 'e'].forEach(id => reg(host, id));
    bridge.push(caps({ maxViews: 0 }));
    expect(syncs().at(-1)!.views).toHaveLength(4);
    expect(host.getSnapshot().overLimit).toEqual(['e']);
  });

  it('tile and immersive share one slot', () => {
    const host = makeHost();
    reg(host, 'a'); reg(host, 'b');
    reg(host, 'a', true);
    bridge.push(caps({ maxViews: 2 }));
    expect(host.getSnapshot().overLimit).toEqual([]);
    expect(syncs().at(-1)!.views.map(v => v.id).sort()).toEqual(['a', 'b']);
  });

  it('a release and re-register in one commit does not push another widget past the limit', () => {
    const host = makeHost();
    const a = reg(host, 'a'); reg(host, 'b'); reg(host, 'c');
    bridge.push(caps({ maxViews: 2 }));
    a.release();
    reg(host, 'a');
    frame();
    expect(host.getSnapshot().overLimit).toEqual(['c']);
    expect(syncs().at(-1)!.views.map(v => v.id)).toEqual(['a', 'b']);
  });

  it('gives a waiting widget the slot once one is really freed, without moving the others', () => {
    const host = makeHost();
    const a = reg(host, 'a'); reg(host, 'b'); reg(host, 'c');
    bridge.push(caps({ maxViews: 2 }));
    a.release();
    frame();
    expect(host.getSnapshot().overLimit).toEqual([]);
    expect(syncs().at(-1)!.views.map(v => v.id)).toEqual(['b', 'c']);
  });
});

describe('heartbeat on unsupported hosts', () => {
  it('stops when caps time out', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    vi.advanceTimersByTime(1600);
    expect(host.getSnapshot().status).toBe('unsupported');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when caps say unsupported', () => {
    const host = makeHost();
    host.register({ id: 'a', url: 'https://a.test/', element: makeEl().el, immersive: false });
    bridge.push(caps({ supported: false }));
    frame();
    expect(vi.getTimerCount()).toBe(0);
  });
});
