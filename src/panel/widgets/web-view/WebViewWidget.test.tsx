import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WebViewWidget } from './WebViewWidget';
import { WebViewImmersive } from './WebViewImmersive';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { webViewHost } from '../../webview/webViewHost';

const widget = (url?: string): PanelWidget => ({
  id: 'w1', type: 'web-view', size: '4x4', config: url === undefined ? {} : { url },
} as PanelWidget);

afterEach(() => {
  window.history.pushState({}, '', '/');
});

// t() returns the key when no provider is mounted, so the keys pin which message shows.
describe('WebViewWidget placeholder', () => {
  it('shows only the site name, without www, on the editor canvas', () => {
    render(<WebViewWidget widget={widget('https://www.example.com/x')} surface="y70" editorPreview />);
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('panel.widget.web-view.previewOnly')).toBeTruthy();
    expect(screen.queryByText('panel.widget.unavailableOnDisplay')).toBeNull();
  });

  it('shows only the site name in the catalog preview', () => {
    render(
      <PanelPreviewProvider value>
        <WebViewWidget widget={widget('example.com')} surface="y70" />
      </PanelPreviewProvider>,
    );
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('panel.widget.web-view.previewOnly')).toBeTruthy();
    expect(screen.queryByText('panel.widget.unavailableOnDisplay')).toBeNull();
  });

  it('shows only the site name outside the live panel page (device page preview)', () => {
    window.history.pushState({}, '', '/devices');
    render(<WebViewWidget widget={widget('https://example.com')} surface="y70" />);
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('panel.widget.web-view.previewOnly')).toBeTruthy();
    expect(screen.queryByText('panel.widget.unavailableOnDisplay')).toBeNull();
  });

  it('draws no favicon image', () => {
    const { container } = render(<WebViewWidget widget={widget('https://example.com')} surface="y70" editorPreview />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('asks for a URL when none is configured', () => {
    render(<WebViewWidget widget={widget()} surface="y70" editorPreview />);
    expect(screen.getByText('panel.widget.web-view.setUrl')).toBeTruthy();
  });

  it('says unavailable only on a live panel page whose host never answered', () => {
    window.history.pushState({}, '', '/panel/dev1');
    // jsdom has no native bridge, so the host settles on unsupported at once.
    render(<WebViewWidget widget={widget('https://example.com')} surface="y70" />);
    expect(screen.getByText('panel.widget.unavailableOnDisplay')).toBeTruthy();
    expect(screen.queryByText('panel.widget.web-view.previewOnly')).toBeNull();
    expect(webViewHost.getSnapshot().status).toBe('unsupported');
  });
});

describe('web-view surface availability', () => {
  it('is limited to y70 and monitor, 4x2 and 4x4, and opts into freeform resizing', async () => {
    const { webViewApp } = await import('./index');
    expect(webViewApp.meta.surfaces).toEqual(['y70', 'monitor']);
    expect(webViewApp.meta.sizes).toEqual(['4x2', '4x4']);
    expect(webViewApp.meta.freeform).toBe(true);
  });
});

describe('web-view over the view limit', () => {
  it('shows the too-many placeholder for a widget past the limit', async () => {
    window.history.pushState({}, '', '/panel/dev1');
    const bridge = { postMessage: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
    (window as unknown as { chrome: unknown }).chrome = { webview: bridge };
    try {
      const { webViewHost: host } = await import('../../webview/webViewHost');
      const { act } = await import('@testing-library/react');
      render(<>{[1, 2, 3, 4, 5].map(n => (
        <WebViewWidget key={n} widget={{ ...widget('https://example.com'), id: `w${n}` }} surface="y70" />
      ))}</>);
      act(() => { window.dispatchEvent(new CustomEvent('nexus-webview', { detail: { type: 'nexus.webview.caps', version: 1, supported: true, maxViews: 4, interactive: true } })); });
      expect(host.getSnapshot().overLimit).toEqual(['w5']);
      expect(screen.getAllByText('panel.widget.web-view.tooMany')).toHaveLength(1);
    } finally {
      delete (window as unknown as { chrome?: unknown }).chrome;
    }
  });
});

describe('WebViewWidget error recovery', () => {
  afterEach(() => vi.restoreAllMocks());

  const failedSnapshot = (canGoBack: boolean, navControls: boolean) => ({
    status: 'supported' as const, interactive: true, contextMenu: true, navControls, maxViews: 4,
    views: { w1: { state: 'error' as const, canGoBack } }, overLimit: [],
  });

  const renderFailed = (canGoBack: boolean, navControls: boolean) => {
    window.history.pushState({}, '', '/panel/dev');
    vi.spyOn(webViewHost, 'getSnapshot').mockReturnValue(failedSnapshot(canGoBack, navControls));
    const send = vi.spyOn(webViewHost, 'sendCommand').mockImplementation(() => {});
    render(<WebViewWidget widget={widget('https://example.com')} surface="y70" />);
    return send;
  };

  it('offers Back when the view can step back, and Home when the host supports it', () => {
    const send = renderFailed(true, true);
    expect(screen.queryByText('panel.widget.web-view.retry')).toBeNull();
    fireEvent.click(screen.getByText('panel.widget.web-view.back'));
    fireEvent.click(screen.getByText('panel.widget.web-view.home'));
    expect(send.mock.calls).toEqual([['w1', 'back'], ['w1', 'home']]);
  });

  it('offers Reload when there is nothing to go back to, and no Home on an older host', () => {
    const send = renderFailed(false, false);
    expect(screen.queryByText('panel.widget.web-view.home')).toBeNull();
    fireEvent.click(screen.getByText('panel.widget.web-view.retry'));
    expect(send).toHaveBeenCalledWith('w1', 'reload');
  });
});

describe('WebViewImmersive forward control', () => {
  afterEach(() => vi.restoreAllMocks());

  const renderStrip = (navControls: boolean, canGoForward: boolean) => {
    window.history.pushState({}, '', '/panel/dev');
    vi.spyOn(webViewHost, 'getSnapshot').mockReturnValue({
      status: 'supported', interactive: true, contextMenu: true, navControls, maxViews: 4,
      views: { w1: { state: 'loaded' as const, canGoBack: true, canGoForward } }, overLimit: [],
    });
    const send = vi.spyOn(webViewHost, 'sendCommand').mockImplementation(() => {});
    render(<WebViewImmersive widget={widget('https://example.com')} surface="y70" />);
    return send;
  };

  const forward = () => screen.getByRole('button', { name: 'panel.widget.web-view.forward' }) as HTMLButtonElement;

  it('sends forward when the view can step forward and the host has nav controls', () => {
    const send = renderStrip(true, true);
    fireEvent.click(forward());
    expect(send).toHaveBeenCalledWith('w1', 'forward');
  });

  it('is disabled with nothing to go forward to, and on a host without nav controls', () => {
    renderStrip(true, false);
    expect(forward().disabled).toBe(true);
    cleanup();
    renderStrip(false, true);
    expect(forward().disabled).toBe(true);
  });
});
