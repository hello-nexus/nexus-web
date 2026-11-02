import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { isDashboardClickthroughType } from '../../engine/panelLayoutHelpers';
import { BuildWidget } from './BuildWidget';
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
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, cb: () => void) => { h.onCaseSignal = cb; },
}));

vi.mock('./BuildPreviewSeed', () => ({ default: ({ caseId }: { caseId: string }) => <div data-testid="seed" data-case={caseId} /> }));
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('2x2 without a case shows the open-air system and no text', async () => {
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('[data-view="no-case"] img[data-open-air]')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
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

  it('shows only the preview image when one is stored', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    h.preview.mockResolvedValue(image());
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\.(cta|spec)/)).toBeNull();
  });

  it('a tile with a case and no image mounts the seed for that case, in release builds too; no case or an image mounts none', async () => {
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
    const caseless = await renderWidget('4x4');
    expect(screen.queryByTestId('seed')).toBeNull();
    caseless.unmount();
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
    expect(view.container.querySelector('svg')).toBeNull();
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

  it('a case that is not a Y70 keeps the silhouette', async () => {
    h.caseId.mockResolvedValue('some-other-case');
    const view = await renderWidget('2x2');
    expect(view.container.querySelector('img[data-stock]')).toBeNull();
    expect(view.container.querySelector('svg')).not.toBeNull();
  });

  it('carries the quiet BUILD tag in every view, hidden from assistive tech', async () => {
    const { container } = await renderWidget('2x2');
    const slot = container.querySelector('[data-placement]');
    expect(slot?.textContent).toBe('panel.widget.build.badge');
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
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
    expect(container.querySelector('[data-view="mac"] svg path')).not.toBeNull();
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
      expect(rows).toEqual(['panel.widget.build.spec.cpudevices.specs.row.processorAMD Ryzen 7 9800X3D', 'panel.widget.build.spec.gpudevices.specs.row.graphicsCardNVIDIA GeForce RTX 5080', 'panel.widget.build.spec.ramdevices.specs.row.memory32 GB DDR5-5600']);
    });

    it('4x4 adds storage, board and the detected cooler', async () => {
      serve();
      const { container } = await renderWidget('4x4');
      expect(container.querySelectorAll('li')).toHaveLength(6);
      expect(container.textContent).toContain('Corsair H150i');
    });
  });
});
