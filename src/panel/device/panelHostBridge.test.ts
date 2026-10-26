// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectHitRects, hitTestMessage, panelHostAvailable, postPanelHostMessage } from './panelHostBridge';

const box = (left: number, top: number, right: number, bottom: number) => ({ getBoundingClientRect: () => ({ left, top, right, bottom }) });
const viewport = { width: 1000, height: 600 };

describe('collectHitRects', () => {
  it('rounds outward to whole CSS px', () => {
    expect(collectHitRects([box(10.4, 20.6, 110.2, 80.1)], viewport)).toEqual([{ x: 10, y: 20, w: 101, h: 61 }]);
  });

  it('clips to the viewport and drops boxes with nothing on screen', () => {
    const rects = collectHitRects([box(-50, -10, 40, 30), box(990, 590, 1200, 700), box(1000, 0, 1500, 100), box(-300, 0, -10, 100), box(5, 5, 5, 50)], viewport);
    expect(rects).toEqual([{ x: 0, y: 0, w: 40, h: 30 }, { x: 990, y: 590, w: 10, h: 10 }]);
  });

  it('keeps a widget on the active page and drops one paged out of view', () => {
    const active = box(100, 100, 300, 300);
    const paged = box(1100, 100, 1300, 300);
    expect(collectHitRects([active, paged], viewport)).toHaveLength(1);
  });
});

describe('hitTestMessage', () => {
  it('sends the rects in region mode', () => {
    expect(hitTestMessage(false, [{ x: 1, y: 2, w: 3, h: 4 }], 1.25)).toEqual({ type: 'nexus.panel.hitTest', mode: 'region', dpr: 1.25, rects: [{ x: 1, y: 2, w: 3, h: 4 }] });
  });

  it('sends no rects in full mode', () => {
    expect(hitTestMessage(true, [{ x: 1, y: 2, w: 3, h: 4 }], 1)).toMatchObject({ mode: 'full', rects: [] });
  });
});

describe('postPanelHostMessage', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).chrome;
    delete (window as unknown as Record<string, unknown>).webkit;
  });

  it('is a no-op without a host', () => {
    expect(panelHostAvailable()).toBe(false);
    expect(() => postPanelHostMessage({ type: 'nexus.panel.raise', value: true })).not.toThrow();
  });

  it('posts an object to WebView2', () => {
    const postMessage = vi.fn();
    (window as unknown as Record<string, unknown>).chrome = { webview: { postMessage } };
    postPanelHostMessage({ type: 'nexus.panel.raise', value: true });
    expect(postMessage).toHaveBeenCalledWith({ type: 'nexus.panel.raise', value: true });
  });

  it('posts a JSON string to the WKWebView handler', () => {
    const postMessage = vi.fn();
    (window as unknown as Record<string, unknown>).webkit = { messageHandlers: { nexusPanel: { postMessage } } };
    postPanelHostMessage({ type: 'nexus.panel.raise', value: false });
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'nexus.panel.raise', value: false }));
  });
});

describe('onHostRequestHitTest', () => {
  it('runs on the macOS hook call', async () => {
    const { onHostRequestHitTest } = await import('./panelHostBridge');
    const cb = vi.fn();
    const off = onHostRequestHitTest(cb);
    (window as unknown as { __nexusPanelHost: { requestHitTest(): void } }).__nexusPanelHost.requestHitTest();
    expect(cb).toHaveBeenCalledOnce();
    off();
    expect((window as unknown as Record<string, unknown>).__nexusPanelHost).toBeUndefined();
  });

  it('runs on a WebView2 message event, object or string', async () => {
    const { onHostRequestHitTest } = await import('./panelHostBridge');
    let listener: ((e: Event) => void) | undefined;
    (window as unknown as Record<string, unknown>).chrome = {
      webview: { postMessage: vi.fn(), addEventListener: (_t: string, l: (e: Event) => void) => { listener = l; }, removeEventListener: vi.fn() },
    };
    const cb = vi.fn();
    const off = onHostRequestHitTest(cb);
    listener!({ data: { type: 'nexus.panel.requestHitTest' } } as unknown as Event);
    listener!({ data: JSON.stringify({ type: 'nexus.panel.requestHitTest' }) } as unknown as Event);
    listener!({ data: { type: 'other' } } as unknown as Event);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
  });

  it('runs on a window message event and stops after unsubscribe', async () => {
    const { onHostRequestHitTest } = await import('./panelHostBridge');
    const cb = vi.fn();
    const off = onHostRequestHitTest(cb);
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'nexus.panel.requestHitTest' } }));
    expect(cb).toHaveBeenCalledOnce();
    off();
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'nexus.panel.requestHitTest' } }));
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('hitTestMessage lease', () => {
  it('marks only a leased full', () => {
    expect(hitTestMessage(true, [], 1, true)).toMatchObject({ mode: 'full', lease: true });
    expect(hitTestMessage(true, [], 1)).not.toHaveProperty('lease');
    expect(hitTestMessage(false, [], 1, true)).not.toHaveProperty('lease');
  });
});

describe('onHostOrigin', () => {
  it('runs on the macOS setOrigin call and on a Windows message, parsing the numbers', async () => {
    const { onHostOrigin, onHostRequestHitTest } = await import('./panelHostBridge');
    let listener: ((e: Event) => void) | undefined;
    (window as unknown as Record<string, unknown>).chrome = {
      webview: { postMessage: vi.fn(), addEventListener: (_t: string, l: (e: Event) => void) => { listener = l; }, removeEventListener: vi.fn() },
    };
    const seen: unknown[] = [];
    const offOrigin = onHostOrigin(o => seen.push(o));
    const request = vi.fn();
    const offRequest = onHostRequestHitTest(request);
    (window as unknown as { __nexusPanelHost: { setOrigin(o: unknown): void } }).__nexusPanelHost.setOrigin({ originX: 0, originY: 25, fullW: 1920, fullH: 1080 });
    listener!({ data: { type: 'nexus.panel.origin', originX: 80, originY: 0, fullW: 2560, fullH: 1440 } } as unknown as Event);
    listener!({ data: JSON.stringify({ type: 'nexus.panel.origin', originX: 'bad' }) } as unknown as Event);
    expect(seen).toEqual([
      { originX: 0, originY: 25, fullW: 1920, fullH: 1080 },
      { originX: 80, originY: 0, fullW: 2560, fullH: 1440 },
      { originX: 0, originY: 0, fullW: undefined, fullH: undefined },
    ]);
    expect(request).not.toHaveBeenCalled();
    offOrigin();
    // The hook stays while a request subscriber remains.
    expect((window as unknown as Record<string, unknown>).__nexusPanelHost).toBeDefined();
    offRequest();
    expect((window as unknown as Record<string, unknown>).__nexusPanelHost).toBeUndefined();
  });
});
