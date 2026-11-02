import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { isDashboardClickthroughType } from '../../engine/panelLayoutHelpers';
import { BuildWidget, resetResizedPreviews } from './BuildWidget';
import { saveNoCasePreview } from '../../../components/views/BuildPage/noCasePreview';
import { getPreviewSize, previewSizeFor, registerPreviewSize, resetPreviewSize } from '../../../components/views/BuildPage/previewSize';
import { FOCUS_COALESCE_MS, PING_RETRY_MIN_MS, useBuildPreview, useHostIsMac } from './useBuildPreview';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const h = vi.hoisted(() => ({
  macShell: false,
  // True at import, which is when the page-only registry and the Build tile's listing read the flag; beforeEach resets it per test.
  devTools: true,
  ping: vi.fn(),
  caseId: vi.fn(),
  preview: vi.fn(),
  onCaseSignal: null as null | (() => void),
  service: vi.fn(),
  specs: null as unknown,
}));

// A test that sets specs gets them without the module's session cache, which would leak into later tests.
vi.mock('../../../hooks/useSystemSpecs', async (importActual) => {
  const actual = await importActual<typeof import('../../../hooks/useSystemSpecs')>();
  return { ...actual, useSystemSpecs: (enabled: boolean) => { const real = actual.useSystemSpecs(enabled); return h.specs ? { specs: enabled ? h.specs as typeof real.specs : null } : real; } };
});

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, cb: () => void) => { h.onCaseSignal = cb; },
}));

vi.mock('./BuildPreviewSeed', () => ({ default: ({ caseId, size }: { caseId: string; size?: number | null }) => <div data-testid="seed" data-case={caseId} data-size={size ?? ''} /> }));
vi.mock('../../../lib/devTools', () => ({ get DEV_TOOLS() { return h.devTools; } }));
vi.mock('../../../app/windowActions', () => ({ isMacAppShell: () => h.macShell }));
vi.mock('../../../api/service', () => ({ pingService: () => h.ping(), fetchService: (path: string) => h.service(path) }));
vi.mock('../../../api/systemPreview', () => ({
  SYSTEM_PREVIEW_CHANGED_EVENT: 'nexus-system-preview-changed',
  SYSTEM_CASE_TOPIC: 'system/case',
  fetchSystemCaseId: () => h.caseId(),
  fetchSystemPreview: (etag?: string | null) => h.preview(etag),
}));

const widget = (size: PanelWidgetSize): PanelWidget => ({ id: 'w', type: 'build', size, col: 0, row: 0 });
const image = (etag: string | null = 'e1') => ({ kind: 'image', blob: new Blob(['png'], { type: 'image/png' }), etag });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

async function renderWidget(size: PanelWidgetSize) {
  const view = render(<BuildWidget widget={widget(size)} />);
  await flush();
  return view;
}

let urlCounter = 0;

describe('BuildWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    urlCounter = 0;
    resetPreviewSize();
    resetResizedPreviews();
    h.specs = null;
    localStorage.clear();
    h.macShell = false;
    h.devTools = false;
    h.ping.mockReset().mockResolvedValue({ platform: 'windows' });
    h.caseId.mockReset().mockResolvedValue(null);
    h.preview.mockReset().mockResolvedValue({ kind: 'none' });
    h.service.mockReset().mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++urlCounter}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('2x2 without a case shows the open-air system and no text', async () => {
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('[data-view="no-case"] img[data-open-air]')).not.toBeNull();
    expect(container.querySelector('svg:not([role="img"])')).toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\.(cta|spec)/)).toBeNull();
  });

  it('shows no call to action in any state, only the image and the specs', async () => {
    const empty = await renderWidget('4x4');
    expect(empty.container.querySelector('[data-view="no-case"] img[data-open-air]')).not.toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\.cta/)).toBeNull();
    empty.unmount();
    h.caseId.mockResolvedValue('hyte-y70');
    const noImage = await renderWidget('4x4');
    expect(noImage.container.querySelector('[data-view="no-preview"]')).not.toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\.cta/)).toBeNull();
  });

  it('no case and no image yet mounts the seed with no case, still showing the open-air placeholder meanwhile', async () => {
    const { container } = await renderWidget('4x4');
    const seed = screen.getByTestId('seed');
    expect(seed.getAttribute('data-case')).toBeNull();
    expect(container.querySelector('[data-view="no-case"] img[data-open-air]')).not.toBeNull();
  });

  it('no case with a snapshot the portal drew for the open PC shows that snapshot, not the placeholder, and mounts no seed', async () => {
    saveNoCasePreview(new Uint8Array([137, 80, 78, 71]).buffer);
    const { container } = await renderWidget('4x2');
    expect(container.querySelector('[data-view="preview"]')).not.toBeNull();
    expect(container.querySelector('img[data-open-air]')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(screen.queryByTestId('seed')).toBeNull();
  });

  it('a snapshot kept for no case is ignored once a case is chosen', async () => {
    saveNoCasePreview(new Uint8Array([1, 2, 3]).buffer);
    h.caseId.mockResolvedValue('hyte-y70');
    const { container } = await renderWidget('4x2');
    expect(container.querySelector('[data-view="no-preview"]')).not.toBeNull();
  });

  it('shows only the preview image when one is stored', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    h.preview.mockResolvedValue(image());
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(container.querySelector('svg:not([role="img"])')).toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\.(cta|spec)/)).toBeNull();
  });

  it('a tile with a case and no image mounts the seed for that case, in release builds too; an image mounts none', async () => {
    h.devTools = true;
    h.caseId.mockResolvedValue('hyte-y70');
    const seeded = await renderWidget('4x4');
    expect(screen.getByTestId('seed').getAttribute('data-case')).toBe('hyte-y70');
    seeded.unmount();
    h.preview.mockResolvedValue(image());
    const stored = await renderWidget('4x4');
    expect(screen.queryByTestId('seed')).toBeNull();
    stored.unmount();
    h.preview.mockResolvedValue({ kind: 'none' });
    h.caseId.mockResolvedValue(null);
    h.devTools = false;
    h.caseId.mockResolvedValue('hyte-y70');
    await renderWidget('4x4');
    expect(screen.getByTestId('seed').getAttribute('data-case')).toBe('hyte-y70');
  });

  it('a Y70 case with no stored image shows the stock image in both themes, still seeds, and the stored image replaces it', async () => {
    h.devTools = true;
    h.caseId.mockResolvedValue('517f12f3-4679-4d13-8832-0fcd2c2a40ea');
    const view = await renderWidget('4x4');
    expect(view.container.querySelectorAll('img[data-stock]')).toHaveLength(1);
    expect(view.container.querySelector('img[data-stock="dark"]')).not.toBeNull();
    expect(view.container.querySelector('svg:not([role="img"])')).toBeNull();
    expect(screen.getByTestId('seed')).toBeTruthy();
    view.unmount();
    h.preview.mockResolvedValue(image());
    const stored = await renderWidget('4x4');
    expect(stored.container.querySelector('img[data-stock]')).toBeNull();
    expect(stored.container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
  });

  it('the stock image follows the nearest themed ancestor and its changes', async () => {
    h.caseId.mockResolvedValue('517f12f3-4679-4d13-8832-0fcd2c2a40ea');
    document.documentElement.setAttribute('data-theme', 'light');
    const scope = document.createElement('div');
    scope.setAttribute('data-theme', 'dark');
    document.body.appendChild(scope);
    const view = render(<BuildWidget widget={widget('2x2')} />, { container: scope.appendChild(document.createElement('div')) });
    await flush();
    expect(view.container.querySelector('img[data-stock="dark"]')).not.toBeNull();
    await act(async () => { scope.setAttribute('data-theme', 'light'); });
    await flush();
    expect(view.container.querySelector('img[data-stock="light"]')).not.toBeNull();
    view.unmount();
    scope.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it('a case that is not a Y70 keeps the box icon', async () => {
    h.caseId.mockResolvedValue('some-other-case');
    const view = await renderWidget('2x2');
    expect(view.container.querySelector('img[data-stock]')).toBeNull();
    expect(view.container.querySelector('svg:not([role="img"])')).not.toBeNull();
  });

  describe('the BUILD label', () => {
    const SPECS = { pcName: 'x', osBuild: '', processor: 'AMD Ryzen 7 9800X3D', motherboard: 'B850I', memory: '32 GB DDR5-5600', storage: '1.82 TB NVMe', graphicsCard: 'RTX 5080', primaryGpu: 'NVIDIA GeForce RTX 5080', monitor: '', soundCard: '', networkCard: '' };
    beforeEach(() => { h.specs = SPECS; });

    it('sits above the specs list on 4x2 and 4x4, hidden from assistive tech', async () => {
      for (const size of ['4x2', '4x4'] as const) {
        const { container, unmount } = await renderWidget(size);
        const label = [...container.querySelectorAll('[aria-hidden="true"]')].find((el) => el.textContent === 'panel.widget.build.badge');
        const list = container.querySelector('ul');
        expect(label).toBeDefined();
        expect(list).not.toBeNull();
        expect(label!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(label!.parentElement).toBe(list!.parentElement);
        unmount();
      }
    });

    it('is absent on 2x2, which is the image alone', async () => {
      const { container } = await renderWidget('2x2');
      expect(container.querySelector('ul')).toBeNull();
      expect(container.textContent).not.toContain('panel.widget.build.badge');
    });
  });

  describe('the preview size handshake', () => {
    const header = (width: number) => {
      const bytes = new Uint8Array(24);
      new DataView(bytes.buffer).setUint32(0, 0x89504e47);
      new DataView(bytes.buffer).setUint32(12, 0x49484452);
      new DataView(bytes.buffer).setUint32(16, width);
      return { kind: 'image', blob: new Blob([bytes], { type: 'image/png' }), etag: `w${width}` };
    };
    const changed = () => act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); await vi.advanceTimersByTimeAsync(0); });

    // The picture box of a tile as the script sees it: the body's layout size, and its rendered size under a transform.
    const sizeBody = (layout: { width: number; height: number }, rendered = layout.width) => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(layout.width);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(layout.height);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: rendered } as DOMRect);
    };

    it('the tile reports its picture box in device pixels over the share the drawing fills', async () => {
      sizeBody({ width: 120, height: 120 });
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
      await renderWidget('2x2');
      expect(getPreviewSize()).toBe(previewSizeFor(120 * 0.82, 2));
    });

    it('measures through a transform scale, where the rendered box differs from the layout box', async () => {
      sizeBody({ width: 120, height: 120 }, 240);
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
      await renderWidget('2x2');
      expect(getPreviewSize()).toBe(previewSizeFor(120 * 0.82 * 2, 1));
    });

    it('measures again when only the device pixel ratio changes', async () => {
      sizeBody({ width: 120, height: 120 });
      let ratio = 1;
      vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
      let onChange: (() => void) | null = null;
      vi.stubGlobal('matchMedia', () => ({ addEventListener: (_: string, cb: () => void) => { onChange = cb; }, removeEventListener: () => {} }));
      await renderWidget('2x2');
      expect(getPreviewSize()).toBe(previewSizeFor(120 * 0.82, 1));
      ratio = 2;
      await act(async () => { onChange?.(); await vi.advanceTimersByTimeAsync(300); });
      expect(getPreviewSize()).toBe(previewSizeFor(120 * 0.82, 2));
      vi.unstubAllGlobals();
    });

    it('two tiles of different sizes publish the largest and fall back to the other when it goes, never overwriting in turn', async () => {
      const widths: Record<string, number> = { '2x2': 120, '4x2': 600 };
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-specs') ? widths['4x2'] : widths['2x2']; });
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-specs') ? 200 : 120; });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: this.hasAttribute('data-specs') ? widths['4x2'] : widths['2x2'] } as DOMRect; });
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
      h.specs = { pcName: 'x', osBuild: '', processor: 'AMD Ryzen 7 9800X3D', motherboard: 'B850I', memory: '32 GB DDR5-5600', storage: '1.82 TB NVMe', graphicsCard: 'RTX 5080', primaryGpu: 'NVIDIA GeForce RTX 5080', monitor: '', soundCard: '', networkCard: '' };
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(540));
      const small = await renderWidget('2x2');
      const smallSize = previewSizeFor(120 * 0.82, 2);
      expect(getPreviewSize()).toBe(smallSize);
      const wide = await renderWidget('4x2');
      const wideSize = previewSizeFor(200 * 0.82, 2);
      expect(wideSize).toBeGreaterThan(smallSize!);
      expect(getPreviewSize()).toBe(wideSize);
      // A stored image that fits the larger size fits both tiles: neither asks for a redraw, and nothing alternates.
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(screen.queryByTestId('seed')).toBeNull();
      expect(getPreviewSize()).toBe(wideSize);
      wide.unmount();
      expect(getPreviewSize()).toBe(smallSize);
      small.unmount();
      // The last size stands for the Build page that replaces the dashboard.
      expect(getPreviewSize()).toBe(smallSize);
    });

    it('a wide tile reports its final square before the spec rows have loaded', async () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.className.includes('gapProbe') ? 0 : 600; });
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600 } as DOMRect);
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
      h.specs = null;
      await renderWidget('4x2');
      expect(getPreviewSize()).toBe(previewSizeFor(200 * 0.82, 2));
    });

    it('a tile stops counting once it stops measuring', async () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-specs') ? 600 : 120; });
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-specs') ? 200 : 120; });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: this.hasAttribute('data-specs') ? 600 : 120 } as DOMRect; });
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
      h.specs = { pcName: 'x', osBuild: '', processor: 'AMD Ryzen 7 9800X3D', motherboard: 'B850I', memory: '32 GB DDR5-5600', storage: '1.82 TB NVMe', graphicsCard: 'RTX 5080', primaryGpu: 'NVIDIA GeForce RTX 5080', monitor: '', soundCard: '', networkCard: '' };
      await renderWidget('2x2');
      const wide = render(<BuildWidget widget={widget('4x2')} />);
      await flush();
      expect(getPreviewSize()).toBe(previewSizeFor(200 * 0.82, 2));
      // The wide tile goes into preview mode (no live data): its entry leaves, so the smaller tile's size is published.
      wide.rerender(<PanelPreviewProvider value><BuildWidget widget={widget('4x2')} /></PanelPreviewProvider>);
      await flush();
      expect(getPreviewSize()).toBe(previewSizeFor(120 * 0.82, 2));
    });

    it('an image far from the wanted size is drawn again, once, and the seed is told the size', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(1024));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.getByTestId('seed').getAttribute('data-size')).toBe('270');
      h.preview.mockResolvedValue(header(270));
      await changed();
      expect(screen.queryByTestId('seed')).toBeNull();
    });

    it('a portal that ignores the size and sends the large image again is not asked a second time', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(1024));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.getByTestId('seed')).toBeTruthy();
      // The service answers 304 for the same bytes, so the stored image and its URL do not change; the portal's save still ends the attempt.
      h.preview.mockResolvedValue({ kind: 'unchanged' });
      await changed();
      expect(screen.queryByTestId('seed')).toBeNull();
    });

    it('a stored image outside the window is redrawn at most once per interval, and at most three times per launch', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(1024));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      // The portal ignores the size and keeps storing the large image, under a new ETag each time.
      let n = 0;
      const seeds: boolean[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        seeds.push(screen.queryByTestId('seed') !== null);
        if (!seeds[attempt]) {
          await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60 * 1000); });
          expect(screen.queryByTestId('seed')).toBeNull();
          await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
          seeds[attempt] = screen.queryByTestId('seed') !== null;
        }
        if (!seeds[attempt]) break;
        h.preview.mockResolvedValue({ ...header(1024), etag: `again-${++n}` });
        await changed();
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      }
      expect(seeds.filter(Boolean)).toHaveLength(3);
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(screen.queryByTestId('seed')).toBeNull();
    });

    it('nothing is decided after the portal saved until the refreshed image has landed', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(1024));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.getByTestId('seed')).toBeTruthy();
      // The save signal arrives and the refetch finds the same bytes: the old width is not judged again.
      h.preview.mockResolvedValue({ kind: 'unchanged' });
      await changed();
      await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60 * 1000); });
      expect(screen.queryByTestId('seed')).toBeNull();
    });

    it('a change of the wanted size draws it again', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(270));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.queryByTestId('seed')).toBeNull();
      await act(async () => { registerPreviewSize('test', 540); await vi.advanceTimersByTimeAsync(0); });
      // A resize drag does not redraw while it moves: the size has to hold still first.
      expect(screen.queryByTestId('seed')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      expect(screen.getByTestId('seed').getAttribute('data-size')).toBe('540');
    });

    it('an image of the right size, or a size nobody measured, mounts no seed', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(header(1024));
      const unmeasured = await renderWidget('4x4');
      expect(screen.queryByTestId('seed')).toBeNull();
      unmeasured.unmount();
      h.preview.mockResolvedValue(header(280));
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.queryByTestId('seed')).toBeNull();
    });

    it('an image whose header cannot be read is kept as it is', async () => {
      h.caseId.mockResolvedValue('hyte-y70');
      h.preview.mockResolvedValue(image());
      registerPreviewSize('test', 270);
      await renderWidget('4x4');
      expect(screen.queryByTestId('seed')).toBeNull();
    });
  });

  it('names the tile in its accessible text', async () => {
    const { container } = await renderWidget('4x4');
    expect(container.textContent).toContain('panel.widget.build');
  });

  it('has no interactive element of its own: the dashboard cell click-through opens Build', async () => {
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('button, a, [tabindex], [role="button"]')).toBeNull();
    expect(isDashboardClickthroughType('build')).toBe(true);
    expect(isDashboardClickthroughType('store')).toBe(false);
  });

  it('macOS shows the Apple logo and makes no case or preview fetch', async () => {
    h.macShell = true;
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('[data-view="mac"] svg:not([role="img"]) path')).not.toBeNull();
    expect(h.caseId).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
    expect(screen.queryByText(/panel\.widget\.build\.(cta|spec)/)).toBeNull();
  });

  it('macOS reported by the service behaves the same', async () => {
    h.ping.mockResolvedValue({ platform: 'macos' });
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('[data-view="mac"]')).not.toBeNull();
    expect(h.caseId).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
  });

  it('a dev-tools build treats macOS as a PC: no Apple logo, the case flow runs, no ping', async () => {
    h.devTools = true;
    h.macShell = true;
    h.caseId.mockResolvedValue('hyte-y70');
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('[data-view="no-preview"]')).not.toBeNull();
    expect(h.preview).toHaveBeenCalled();
    expect(h.ping).not.toHaveBeenCalled();
    expect(container.querySelector('[data-view="mac"]')).toBeNull();
  });

  it('a dev-tools build shows the case icon in the catalog preview inside the macOS shell', () => {
    h.devTools = true;
    h.macShell = true;
    const { container } = render(<PanelPreviewProvider value={true}><BuildWidget widget={widget('4x4')} /></PanelPreviewProvider>);
    expect(container.querySelector('[data-view="no-case"]')).not.toBeNull();
  });

  it('the catalog preview is inert, and shows the Apple logo inside the macOS shell', () => {
    const { container, unmount } = render(
      <PanelPreviewProvider value={true}><BuildWidget widget={widget('4x4')} /></PanelPreviewProvider>,
    );
    expect(container.querySelector('[data-view="no-case"]')).not.toBeNull();
    expect(container.querySelector('button, [tabindex]')).toBeNull();
    expect(h.ping).not.toHaveBeenCalled();
    unmount();
    h.macShell = true;
    const mac = render(<PanelPreviewProvider value={true}><BuildWidget widget={widget('4x4')} /></PanelPreviewProvider>);
    expect(mac.container.querySelector('[data-view="mac"]')).not.toBeNull();
  });
});

describe('useHostIsMac', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.macShell = false;
    h.ping.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('falls back to not-macOS on a failed ping, retries with backoff, and corrects itself', async () => {
    h.ping.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ platform: 'macos' });
    const { result } = renderHook(() => useHostIsMac(true));
    await flush();
    expect(result.current).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(PING_RETRY_MIN_MS); });
    expect(h.ping).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(PING_RETRY_MIN_MS * 2); });
    expect(h.ping).toHaveBeenCalledTimes(3);
    expect(result.current).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(h.ping).toHaveBeenCalledTimes(3);
  });

  it('retries immediately on window focus', async () => {
    h.ping.mockResolvedValueOnce(null).mockResolvedValue({ platform: 'windows' });
    renderHook(() => useHostIsMac(true));
    await flush();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(h.ping).toHaveBeenCalledTimes(2);
  });
});

describe('useBuildPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    urlCounter = 0;
    h.caseId.mockReset().mockResolvedValue('c1');
    h.preview.mockReset().mockResolvedValue(image('e1'));
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++urlCounter}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('settles as loaded with no image when the fetch rejects', async () => {
    h.preview.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    expect(result.current).toMatchObject({ loaded: true, previewUrl: null });
  });

  it('refetches the case when the service signals it changed', async () => {
    h.caseId.mockResolvedValue(null);
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    expect(result.current.caseId).toBeNull();
    h.caseId.mockResolvedValue('y70');
    await act(async () => { h.onCaseSignal?.(); });
    await flush();
    expect(result.current.caseId).toBe('y70');
  });

  it('keeps the current image when a later fetch fails', async () => {
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    h.preview.mockResolvedValue({ kind: 'error' });
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    await flush();
    expect(result.current.previewUrl).toBe('blob:preview-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('replaces the image on a change event and revokes the old URL', async () => {
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    h.preview.mockResolvedValue(image('e2'));
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    await flush();
    expect(h.preview).toHaveBeenLastCalledWith('e1');
    expect(result.current.previewUrl).toBe('blob:preview-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('keeps the same URL when the service reports the image unchanged', async () => {
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    h.preview.mockResolvedValue({ kind: 'unchanged' });
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    await flush();
    expect(result.current.previewUrl).toBe('blob:preview-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('drops the image when the preview goes away', async () => {
    const { result } = renderHook(() => useBuildPreview(true));
    await flush();
    h.preview.mockResolvedValue({ kind: 'none' });
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    await flush();
    expect(result.current.previewUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('refetches on focus once, coalescing a burst and a focus right after a fetch', async () => {
    renderHook(() => useBuildPreview(true));
    await flush();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(h.preview).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOCUS_COALESCE_MS); });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(h.preview).toHaveBeenCalledTimes(2);
  });

  it('ignores a superseded response that resolves late', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    h.preview.mockReset()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValue(image('new'));
    const { result } = renderHook(() => useBuildPreview(true));
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus-system-preview-changed')); });
    await flush();
    expect(result.current.previewUrl).toBe('blob:preview-1');
    await act(async () => { resolveFirst(image('old')); });
    await flush();
    expect(result.current.previewUrl).toBe('blob:preview-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes the live URL on unmount', async () => {
    const { unmount } = renderHook(() => useBuildPreview(true));
    await flush();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  describe('spec rows', () => {
    const specs = {
      pcName: 'PC', osBuild: '', processor: 'AMD Ryzen 7 9800X3D', motherboard: 'Gigabyte B850I AORUS PRO', memory: '32 GB DDR5-5600',
      storage: '1.82 TB NVMe', graphicsCard: 'NVIDIA GeForce RTX 5080', primaryGpu: 'NVIDIA GeForce RTX 5080', monitor: '', soundCard: '', networkCard: '',
    };
    const serve = () => h.service.mockImplementation(async (path: string) => (path === '/system/specs' ? specs : path === '/system/devices' ? { devices: [{ category: 'cooler', vendor: 'Corsair', model: 'H150i' }] } : null));

    it('2x2 lists no specs', async () => {
      serve();
      const { container } = await renderWidget('2x2');
      expect(container.querySelector('li')).toBeNull();
      expect(h.service).not.toHaveBeenCalled();
    });

    it('4x2 lists processor, graphics card and memory beside the image', async () => {
      serve();
      const { container } = await renderWidget('4x2');
      const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
      expect(rows).toEqual(['panel.widget.build.spec.cpudevices.specs.row.processorRyzen 7 9800X3D', 'panel.widget.build.spec.gpudevices.specs.row.graphicsCardRTX 5080', 'panel.widget.build.spec.ramdevices.specs.row.memory32 GB DDR5']);
    });

    it('4x4 adds storage, board and the detected cooler', async () => {
      serve();
      const { container } = await renderWidget('4x4');
      expect(container.querySelectorAll('li')).toHaveLength(6);
      expect(container.textContent).toContain('H150i');
    });
  });
});
