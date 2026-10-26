import { afterEach, describe, expect, it, vi } from 'vitest';
import { postToHost } from './hostBridge';

afterEach(() => {
  delete (window as unknown as { chrome?: unknown }).chrome;
  delete (window as unknown as { webkit?: unknown }).webkit;
});

describe('postToHost setFrost', () => {
  it('sends the structured payload to a WebView2 host', () => {
    const postMessage = vi.fn();
    (window as unknown as { chrome: unknown }).chrome = { webview: { postMessage } };
    postToHost({ type: 'setFrost', value: true });
    expect(postMessage).toHaveBeenCalledWith({ type: 'setFrost', value: true });
  });

  it('sends the JSON string to a WKWebView host', () => {
    const postMessage = vi.fn();
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { nexusOverlay: { postMessage } } };
    postToHost({ type: 'setFrost', value: false });
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'setFrost', value: false }));
  });
});
