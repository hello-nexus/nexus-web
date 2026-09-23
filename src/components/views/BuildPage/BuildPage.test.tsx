import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildPage, BUILD_ORIGIN } from './BuildPage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

const h = vi.hoisted(() => ({
  themeMode: 'dark' as 'dark' | 'light' | 'system',
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  isRemoteOrigin: false,
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: { themeMode: h.themeMode }, update: vi.fn(), hydrated: true }),
}));
vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: null }),
}));
vi.mock('../../../hooks/useFpsGames', () => ({
  useFpsGames: () => ({ supported: true, gamesByKey: new Map(), refetch: vi.fn() }),
}));
vi.mock('../../../sandbox/ui/openExternal', () => ({
  openExternalUrl: (...args: unknown[]) => h.openExternalUrl(...args),
}));
vi.mock('../../../api/service', () => ({
  get isRemoteOrigin() { return h.isRemoteOrigin; },
}));

function getIframe(): HTMLIFrameElement {
  const iframe = document.querySelector('iframe');
  if (!iframe) throw new Error('iframe not found');
  return iframe as HTMLIFrameElement;
}

function postFromFrame(iframe: HTMLIFrameElement, data: unknown, origin = BUILD_ORIGIN) {
  const event = new MessageEvent('message', { data, origin, source: iframe.contentWindow });
  window.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  h.themeMode = 'dark';
  h.isRemoteOrigin = false;
  h.openExternalUrl.mockClear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('BuildPage', () => {
  it('posts hello only after a ready message from the right origin and source', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

    // Wrong origin: ignored.
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }, 'https://evil.example.com'));
    expect(postSpy).not.toHaveBeenCalled();

    // Right origin, right source: hello follows.
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'nexus-build:hello', v: 1, theme: 'dark', locale: 'en', host: 'app' }),
      BUILD_ORIGIN,
    );
  });

  it('ignores a ready message from a wrong source window', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

    const event = new MessageEvent('message', {
      data: { type: 'nexus-build:ready' },
      origin: BUILD_ORIGIN,
      source: window,
    });
    act(() => window.dispatchEvent(event));
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('routes open-external messages through the openExternal helper', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

    act(() => postFromFrame(iframe, { type: 'nexus-build:open-external', url: 'https://build.hellonexus.com/products/rtx-5080' }));
    expect(h.openExternalUrl).toHaveBeenCalledWith('https://build.hellonexus.com/products/rtx-5080');
  });

  it('posts a route message (not a reload) when the path prop changes after ready', () => {
    const { rerender } = render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

    rerender(<BuildPage path="/upgrade?bench=abc" />);

    expect(postSpy).toHaveBeenCalledWith(
      { type: 'nexus-build:route', v: 1, path: '/upgrade?bench=abc' },
      BUILD_ORIGIN,
    );
    // Same iframe element, not remounted.
    expect(document.querySelectorAll('iframe').length).toBe(1);
    expect(getIframe()).toBe(iframe);
  });

  it('tracks the open-in-browser link target from a navigate message', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    act(() => postFromFrame(iframe, { type: 'nexus-build:navigate', path: '/products/rtx-5080' }));

    act(() => { screen.getByText('build.openInBrowser').click(); });
    expect(h.openExternalUrl).toHaveBeenCalledWith(`${BUILD_ORIGIN}/products/rtx-5080`);
  });

  it('posts a fresh hello on every ready message, not just the first (the portal full-loads between routes)', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

    const helloPosts = postSpy.mock.calls.filter(([msg]) => (msg as { type?: string }).type === 'nexus-build:hello');
    expect(helloPosts).toHaveLength(2);
  });

  it('still updates the open-in-browser target from a navigate message after a later ready', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    act(() => postFromFrame(iframe, { type: 'nexus-build:navigate', path: '/products/rtx-5080' }));

    act(() => { screen.getByText('build.openInBrowser').click(); });
    expect(h.openExternalUrl).toHaveBeenCalledWith(`${BUILD_ORIGIN}/products/rtx-5080`);
  });

  it('shows the offline fallback card after 8s with no ready message', () => {
    render(<BuildPage path="/upgrade" />);
    expect(screen.queryByText('build.offline.title')).toBeNull();

    act(() => { vi.advanceTimersByTime(8000); });

    expect(screen.getByText('build.offline.title')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('remounts the iframe on retry from the fallback card', () => {
    render(<BuildPage path="/upgrade" />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText('build.offline.title')).toBeInTheDocument();

    act(() => { screen.getByText('build.offline.retry').click(); });

    expect(screen.queryByText('build.offline.title')).toBeNull();
    expect(document.querySelector('iframe')).not.toBeNull();
  });
});
