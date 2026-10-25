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
  devTools: false,
  ping: vi.fn(),
  caseId: vi.fn(),
  preview: vi.fn(),
}));

vi.mock('../../../lib/devTools', () => ({ get DEV_TOOLS() { return h.devTools; } }));
vi.mock('../../../app/windowActions', () => ({ isMacAppShell: () => h.macShell }));
vi.mock('../../../api/service', () => ({ pingService: () => h.ping() }));
vi.mock('../../../api/systemPreview', () => ({
  SYSTEM_PREVIEW_CHANGED_EVENT: 'nexus-system-preview-changed',
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
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++urlCounter}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('2x2 without a case shows the silhouette and no text', async () => {
    const { container } = await renderWidget('2x2');
    expect(container.querySelector('[data-view="no-case"] svg')).not.toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('4x4 without a case shows the Build invitation', async () => {
    await renderWidget('4x4');
    expect(screen.getByText('panel.widget.build.cta')).toBeTruthy();
  });

  it('a case with no preview: 4x4 shows the same invitation, 2x2 stays silent', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    const big = await renderWidget('4x4');
    expect(screen.getByText('panel.widget.build.cta')).toBeTruthy();
    big.unmount();
    const small = await renderWidget('2x2');
    expect(small.container.querySelector('[data-view="no-preview"]')).not.toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('keeps the 4x4 notice slot in the silhouette while loading, so the notice never shifts it', () => {
    h.ping.mockReturnValue(new Promise(() => {}));
    const { container } = render(<BuildWidget widget={widget('4x4')} />);
    expect(container.querySelector('[data-view="loading"] svg')).not.toBeNull();
    expect(container.querySelectorAll('[data-view="loading"] > span').length).toBe(2);
  });

  it('shows only the preview image when one is stored', async () => {
    h.caseId.mockResolvedValue('hyte-y70');
    h.preview.mockResolvedValue(image());
    const { container } = await renderWidget('4x4');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
  });

  it('names the tile and carries the notice in its accessible text', async () => {
    const { container } = await renderWidget('4x4');
    expect(container.textContent).toContain('panel.widget.build');
    expect(container.textContent).toContain('panel.widget.build.cta');
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
    expect(screen.queryByText(/panel\.widget\.build\./)).toBeNull();
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
});
