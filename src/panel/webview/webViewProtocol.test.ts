import { describe, expect, it, vi } from 'vitest';
import { detectTransport, parseInbound } from './webViewProtocol';

const hello = { type: 'nexus.webview.hello', version: 1 } as const;

describe('detectTransport', () => {
  it('returns null on a host with no native layer', () => {
    expect(detectTransport({})).toBeNull();
  });

  it('posts the object to WebView2', () => {
    const postMessage = vi.fn();
    const t = detectTransport({ chrome: { webview: { postMessage } } });
    expect(t?.kind).toBe('webview2');
    t?.post(hello);
    expect(postMessage).toHaveBeenCalledWith(hello);
  });

  it('posts the object to the WKWebView handler', () => {
    const postMessage = vi.fn();
    const t = detectTransport({ webkit: { messageHandlers: { nexusWebView: { postMessage } } } });
    expect(t?.kind).toBe('webkit');
    t?.post(hello);
    expect(postMessage).toHaveBeenCalledWith(hello);
  });

  it('posts a JSON string to the Android interface', () => {
    const postMessage = vi.fn();
    const t = detectTransport({ NexusWebView: { postMessage } });
    expect(t?.kind).toBe('android');
    t?.post(hello);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(hello));
  });

  it('posts a JSON string to react-native-webview', () => {
    const postMessage = vi.fn();
    const t = detectTransport({ ReactNativeWebView: { postMessage } });
    expect(t?.kind).toBe('react-native');
    t?.post(hello);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(hello));
  });

  it('prefers WebView2 when several are present', () => {
    const t = detectTransport({
      chrome: { webview: { postMessage: vi.fn() } },
      ReactNativeWebView: { postMessage: vi.fn() },
    });
    expect(t?.kind).toBe('webview2');
  });
});

describe('parseInbound', () => {
  it('parses caps from an object or a JSON string', () => {
    const caps = { type: 'nexus.webview.caps', version: 1, supported: true, maxViews: 4, interactive: false, contextMenu: true, longPress: true, navControls: true };
    expect(parseInbound(caps)).toEqual(caps);
    expect(parseInbound({ ...caps, longPress: undefined })).toMatchObject({ longPress: false });
    expect(parseInbound(JSON.stringify(caps))).toEqual(caps);
  });

  it('reads away on a state message only when exactly true', () => {
    expect(parseInbound({ type: 'nexus.webview.state', id: 'a', state: 'loaded', canGoBack: true, away: true })).toMatchObject({ away: true });
    expect(parseInbound({ type: 'nexus.webview.state', id: 'a', state: 'loaded', canGoBack: true })).toMatchObject({ away: false });
  });

  it('parses a host-reported right-click and rejects non-finite coordinates', () => {
    expect(parseInbound({ type: 'nexus.webview.contextmenu', id: 'w1', x: 10.5, y: 20 })).toEqual({ type: 'nexus.webview.contextmenu', id: 'w1', x: 10.5, y: 20 });
    expect(parseInbound({ type: 'nexus.webview.contextmenu', id: 'w1', x: 'a', y: 20 })).toBeNull();
  });

  it('reads interactive as true only when it is exactly true', () => {
    const base = { type: 'nexus.webview.caps', version: 1, supported: true, maxViews: 4 };
    expect((parseInbound({ ...base }) as { interactive: boolean }).interactive).toBe(false);
    expect((parseInbound({ ...base, interactive: 'yes' }) as { interactive: boolean }).interactive).toBe(false);
    expect((parseInbound({ ...base, interactive: true }) as { interactive: boolean }).interactive).toBe(true);
  });

  it('parses a state frame and drops unknown states', () => {
    expect(parseInbound({ type: 'nexus.webview.state', id: 'a', state: 'error', code: 'x', canGoBack: true }))
      .toEqual({ type: 'nexus.webview.state', id: 'a', state: 'error', code: 'x', canGoBack: true, away: false });
    expect(parseInbound({ type: 'nexus.webview.state', id: 'a', state: 'weird', canGoBack: false })).toBeNull();
  });

  it('ignores foreign frames and bad JSON', () => {
    expect(parseInbound({ type: 'other' })).toBeNull();
    expect(parseInbound('{nope')).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });
});
