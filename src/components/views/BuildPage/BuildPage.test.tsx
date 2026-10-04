import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildPage, BUILD_ORIGIN, sanitizeBuildPath } from './BuildPage';
import { useBuildFrameHistory } from './buildNav';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import type { FpsGameSummary } from '../../../api/fps';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

const h = vi.hoisted(() => ({
  themeMode: 'dark' as 'dark' | 'light' | 'system',
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  isRemoteOrigin: false,
  specs: null as unknown as SystemSpecs | null,
  gamesByKey: new Map<string, FpsGameSummary>(),
  serverCase: null as string | null,
  fetchService: vi.fn(),
  putService: vi.fn(),
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: { themeMode: h.themeMode }, update: vi.fn(), hydrated: true }),
}));
vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: h.specs }),
}));
vi.mock('../../../hooks/useFpsGames', () => ({
  useFpsGames: () => ({ supported: true, gamesByKey: h.gamesByKey, refetch: vi.fn() }),
}));
vi.mock('../../../sandbox/ui/openExternal', () => ({
  openExternalUrl: (...args: unknown[]) => h.openExternalUrl(...args),
}));
vi.mock('../../../api/service', () => ({
  get isRemoteOrigin() { return h.isRemoteOrigin; },
  fetchService: (...args: unknown[]) => h.fetchService(...args),
  putService: (...args: unknown[]) => h.putService(...args),
}));

const SAMPLE_SPECS: SystemSpecs = {
  pcName: 'rig', osBuild: '', processor: 'AMD Ryzen 7 7800X3D', motherboard: 'X670E',
  memory: '32 GB', storage: '2 TB', graphicsCard: 'RTX 4080', primaryGpu: 'RTX 4080',
  monitor: '2560×1440 @ 165 Hz', soundCard: '', networkCard: '',
};

function sampleGame(gameKey: string, focusedSec: number): FpsGameSummary {
  return {
    gameKey, name: gameKey, store: 'steam', steamAppId: null, sessions: 1, focusedSec,
    avgFps: 60, p1Fps: 50, p99Fps: 70, minFps: 40, maxFps: 90, lastPlayedUtcMs: 0,
  };
}

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
  h.specs = null;
  h.gamesByKey = new Map();
  h.openExternalUrl.mockClear();
  h.serverCase = null;
  h.fetchService.mockReset();
  h.fetchService.mockImplementation(async (path: string) => (path === '/system/case' ? { caseId: h.serverCase } : null));
  h.putService.mockReset();
  h.putService.mockImplementation(async (_path: string, body: { caseId: string | null }) => ({ caseId: body.caseId }));
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

  it('tells the frame about the glass backdrop in hello and when it toggles', async () => {
    const root = document.documentElement;
    root.classList.add('nexus-shell-native-glass');
    root.setAttribute('data-bg', 'glass');
    try {
      render(<BuildPage path="/upgrade" />);
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
      expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'nexus-build:hello', glass: true }), BUILD_ORIGIN);

      postSpy.mockClear();
      await act(async () => { root.setAttribute('data-bg', 'flat'); });
      expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'nexus-build:theme', glass: false }), BUILD_ORIGIN);
    } finally {
      root.classList.remove('nexus-shell-native-glass');
      root.removeAttribute('data-bg');
    }
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

  it('advertises open-benchmark in hello only when it can open Benchmark, and runs it on request', () => {
    const onOpenBenchmark = vi.fn();
    render(<BuildPage path="/bench" onOpenBenchmark={onOpenBenchmark} />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'nexus-build:hello', canOpenBenchmark: true }), BUILD_ORIGIN);

    act(() => postFromFrame(iframe, { type: 'nexus-build:open-benchmark' }));
    expect(onOpenBenchmark).toHaveBeenCalledTimes(1);

    // A foreign origin cannot trigger it.
    act(() => postFromFrame(iframe, { type: 'nexus-build:open-benchmark' }, 'https://evil.example'));
    expect(onOpenBenchmark).toHaveBeenCalledTimes(1);
  });

  it('omits canOpenBenchmark from hello without a handler', () => {
    render(<BuildPage path="/bench" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    const hello = postSpy.mock.calls.map(([msg]) => msg as Record<string, unknown>).find(m => m.type === 'nexus-build:hello');
    expect(hello).toBeDefined();
    expect(hello).not.toHaveProperty('canOpenBenchmark');
  });

  it('shares the frame\'s back/forward reach with the top bar, and drops it when the page unmounts', () => {
    const { unmount } = render(<BuildPage path="/builder" />);
    const history = renderHook(() => useBuildFrameHistory());
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    expect(history.result.current).toEqual({ canGoBack: false, canGoForward: false });

    act(() => postFromFrame(iframe, { type: 'nexus-build:history', canGoBack: true, canGoForward: false }));
    expect(history.result.current).toEqual({ canGoBack: true, canGoForward: false });

    unmount();
    expect(history.result.current).toEqual({ canGoBack: false, canGoForward: false });
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

  it('posts a fresh hello on every ready message, not just the first (the portal full-loads between routes)', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

    const helloPosts = postSpy.mock.calls.filter(([msg]) => (msg as { type?: string }).type === 'nexus-build:hello');
    expect(helloPosts).toHaveLength(2);
  });

  it('renders no chrome of its own above the frame (the portal carries its own bar)', () => {
    render(<BuildPage path="/upgrade" />);
    expect(screen.queryByText('build.openInBrowser')).toBeNull();
    expect(document.querySelector('iframe')).not.toBeNull();
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

  it('reloads the frame\'s last known page (not the original deep link) on retry', () => {
    render(<BuildPage path={encodeURIComponent('/upgrade?bench=abc')} />);
    const iframe = getIframe();
    // The frame navigated (and told the host so) but never got as far as a
    // second `ready` before stalling - `lastPath` still tracks where it was.
    act(() => postFromFrame(iframe, { type: 'nexus-build:navigate', path: '/products/rtx-5080' }));
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText('build.offline.title')).toBeInTheDocument();

    act(() => { screen.getByText('build.offline.retry').click(); });

    expect(getIframe().src).toBe(`${BUILD_ORIGIN}/products/rtx-5080`);
  });

  it('automatically remounts to the frame\'s last known page when connectivity returns while stuck', () => {
    render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    act(() => postFromFrame(iframe, { type: 'nexus-build:navigate', path: '/products/rtx-5080' }));

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('build.offline.title')).toBeInTheDocument();

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText('build.offline.title')).toBeNull();
    expect(getIframe().src).toBe(`${BUILD_ORIGIN}/products/rtx-5080`);
  });

  it('sets a restrictive sandbox with no top-navigation or popup escape', () => {
    render(<BuildPage path="/upgrade" />);
    const sandbox = getIframe().getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).toContain('allow-forms');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-popups');
  });

  it('sends a fresh hello, deduped, when specs and games resolve after the handshake', () => {
    const { rerender } = render(<BuildPage path="/upgrade" />);
    const iframe = getIframe();
    const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
    act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

    const helloTypeOf = (call: unknown[]) => (call[0] as { type?: string }).type;
    const helloPosts = () => postSpy.mock.calls.filter(c => helloTypeOf(c) === 'nexus-build:hello');
    expect(helloPosts()).toHaveLength(1);
    expect(helloPosts()[0][0]).not.toHaveProperty('machine');
    expect(helloPosts()[0][0]).not.toHaveProperty('games');

    // Specs and the games list resolve after the handshake (slow service/relay).
    h.specs = SAMPLE_SPECS;
    h.gamesByKey = new Map([['steam:730', sampleGame('steam:730', 500)]]);
    rerender(<BuildPage path="/upgrade" />);

    expect(helloPosts()).toHaveLength(2);
    expect(helloPosts()[1][0]).toMatchObject({ machine: expect.objectContaining({ processor: 'AMD Ryzen 7 7800X3D' }) });
    expect((helloPosts()[1][0] as { games?: unknown[] }).games).toEqual([{ gameKey: 'steam:730', title: 'steam:730' }]);

    // Re-rendering with unchanged data must not send a third, identical hello.
    rerender(<BuildPage path="/upgrade" />);
    expect(helloPosts()).toHaveLength(2);
  });

  it('exports a path validator that rejects a host-escaping shape and accepts a safe one', () => {
    expect(sanitizeBuildPath(encodeURIComponent('/upgrade?bench=abc'))).toBe('/upgrade?bench=abc');
    expect(sanitizeBuildPath(null)).toBe('/builder');
    expect(sanitizeBuildPath(undefined)).toBe('/builder');
    // No leading slash: `${BUILD_ORIGIN}${path}` would resolve to a different host.
    expect(sanitizeBuildPath(encodeURIComponent('.attacker.com'))).toBe('/builder');
    // Protocol-relative.
    expect(sanitizeBuildPath(encodeURIComponent('//attacker.com'))).toBe('/builder');
    // "@" before the query, e.g. userinfo-style host confusion.
    expect(sanitizeBuildPath(encodeURIComponent('/@evil.com'))).toBe('/builder');
    // Malformed percent-encoding.
    expect(sanitizeBuildPath('%')).toBe('/builder');
  });

  it('renders an iframe pointed at build.hellonexus.com even given a host-escaping path prop', () => {
    render(<BuildPage path={encodeURIComponent('.attacker.com')} />);
    const src = getIframe().src;
    expect(src.startsWith(BUILD_ORIGIN)).toBe(true);
    expect(src).toBe(`${BUILD_ORIGIN}/builder`);
  });
  describe('this PC\'s case', () => {
    const helloPosts = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.filter(c => (c[0] as { type?: string }).type === 'nexus-build:hello').map(c => c[0] as { machine?: { caseId?: string } });
    const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

    it('carries the saved caseId in the hello machine object', async () => {
      h.specs = SAMPLE_SPECS;
      h.serverCase = 'case-fractal-north';
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      expect(h.fetchService).toHaveBeenCalledWith('/system/case');
      expect(helloPosts(postSpy)[0].machine).toMatchObject({ caseId: 'case-fractal-north', processor: 'AMD Ryzen 7 7800X3D' });
    });

    it('carries the keyboard and mouse the lighting devices report', async () => {
      h.specs = SAMPLE_SPECS;
      h.fetchService.mockImplementation(async (path: string) => (path === '/devices/lighting-devices/all'
        ? { isInit: true, devices: [{ id: 'm65', name: 'Corsair M65 PRO', type: 'mouse', ledsOn: true, ledCount: 15, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 }] }
        : null));
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      expect(helloPosts(postSpy)[0].machine).toMatchObject({ peripherals: [{ category: 'mouse', name: 'Corsair M65 PRO' }] });
    });

    it('omits caseId from the machine object when none is set', async () => {
      h.specs = SAMPLE_SPECS;
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      expect(helloPosts(postSpy)[0].machine).not.toHaveProperty('caseId');
    });

    it('saves a set-case pick through the service and re-posts hello with it', async () => {
      h.specs = SAMPLE_SPECS;
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: 'case-abc' }));
      await flush();

      expect(h.putService).toHaveBeenCalledWith('/system/case', { caseId: 'case-abc' });
      const posts = helloPosts(postSpy);
      expect(posts).toHaveLength(2);
      expect(posts[1].machine).toMatchObject({ caseId: 'case-abc' });
    });

    it('clears the pick on set-case null', async () => {
      h.specs = SAMPLE_SPECS;
      h.serverCase = 'case-abc';
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: null }));
      await flush();

      expect(h.putService).toHaveBeenCalledWith('/system/case', { caseId: null });
      expect(helloPosts(postSpy).at(-1)?.machine).not.toHaveProperty('caseId');
    });

    it.each([
      ['empty', ''],
      ['a space', 'has space'],
      ['a slash', 'a/b'],
      ['too long', 'a'.repeat(65)],
      ['a number', 42],
      ['undefined', undefined],
    ])('rejects a set-case id that is %s without calling the service', async (_label, bad) => {
      h.specs = SAMPLE_SPECS;
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: bad }));
      await flush();

      expect(h.putService).not.toHaveBeenCalled();
    });

    it('ignores set-case from the wrong origin or source', async () => {
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: 'case-abc' }, 'https://evil.example.com'));
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'nexus-build:set-case', v: 1, caseId: 'case-abc' },
          origin: BUILD_ORIGIN,
          source: window,
        }));
      });
      await flush();

      expect(h.putService).not.toHaveBeenCalled();
    });

    it('keeps the initial GET\'s case when a save fails before the GET resolves', async () => {
      h.specs = SAMPLE_SPECS;
      let resolveGet: (v: unknown) => void = () => {};
      h.fetchService.mockImplementation((path: string) => (path === '/system/case' ? new Promise(resolve => { resolveGet = resolve; }) : Promise.resolve(null)));
      h.putService.mockImplementation(async () => null);
      render(<BuildPage path="/builder" />);
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: 'case-new' }));
      await flush();
      await act(async () => { resolveGet({ caseId: 'case-stored' }); await Promise.resolve(); });
      await flush();

      expect(helloPosts(postSpy).at(-1)?.machine).toMatchObject({ caseId: 'case-stored' });
    });

    it('keeps the old caseId when the service refuses the save', async () => {
      h.specs = SAMPLE_SPECS;
      h.serverCase = 'case-old';
      h.putService.mockImplementation(async () => ({ error: true, msg: 'nope' }));
      render(<BuildPage path="/builder" />);
      await flush();
      const iframe = getIframe();
      const postSpy = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
      act(() => postFromFrame(iframe, { type: 'nexus-build:ready' }));

      act(() => postFromFrame(iframe, { type: 'nexus-build:set-case', v: 1, caseId: 'case-new' }));
      await flush();

      const posts = helloPosts(postSpy);
      expect(posts).toHaveLength(1);
      expect(posts[0].machine).toMatchObject({ caseId: 'case-old' });
    });
  });
});
