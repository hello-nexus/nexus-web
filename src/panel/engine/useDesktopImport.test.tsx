import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { IMPORT_MAX_WAITS, IMPORT_RETRY_MS, IMPORT_SETTLE_MS, useDesktopImport } from './useDesktopImport';

const patchMock = vi.fn();
vi.mock('../../api/panel', () => ({ patchPanelDevice: (...a: unknown[]) => patchMock(...a) }));
vi.mock('./legacySize', () => ({ snapLegacySize: (_t: string, size: string) => size }));

const grid = { columns: 20, rows: 12, cellSize: 100, rowSize: 100, gap: 8, padding: 8 };
const pending: DesktopImportDto = { version: 1, cellPx: 86, cellUnits: 'device', merge: false, widgets: [{ id: 'legacy', type: 'clock', size: '2x2', col: 0, row: 0 }] };
const layoutOf = (ids: string[]): PanelLayout => ({
  layoutSchemaVersion: 2, surface: 'monitor',
  pages: [{ id: 'p1', widgets: ids.map((id, i) => ({ id, type: 'clock', size: '2x2' as const, col: 4 + i * 2, row: 4 })) }],
});
const args = (over: Partial<Parameters<typeof useDesktopImport>[0]> = {}) =>
  ({ enabled: true, hostReady: () => true, deviceId: 'rec', pending, layout: layoutOf([]), paddingPercent: 100, grid, ...over });

beforeEach(() => { vi.useFakeTimers(); patchMock.mockReset().mockResolvedValue({ id: 'rec' }); });
afterEach(() => vi.useRealTimers());

// One tick samples the size, one quiet interval later the import is placed.
const SETTLED = IMPORT_SETTLE_MS * 2 + 10;
const settle = async (ms = SETTLED) => { await vi.advanceTimersByTimeAsync(ms); };

describe('useDesktopImport', () => {
  it('places the import once and clears it', async () => {
    renderHook(() => useDesktopImport(args()));
    await settle();
    expect(patchMock).toHaveBeenCalledOnce();
    expect(patchMock.mock.calls[0][1]).toMatchObject({ clearDesktopImport: true });
    expect(patchMock.mock.calls[0][1].gridSlots).toBeDefined();
  });

  it('keeps what the user already placed and the current grid', async () => {
    renderHook(() => useDesktopImport(args({ layout: layoutOf(['mine']) })));
    await settle();
    const patch = patchMock.mock.calls[0][1];
    expect(patch.gridSlots).toBeUndefined();
    expect((patch.layout as PanelLayout).pages.flatMap(p => p.widgets).map(w => w.id).sort()).toEqual(['legacy', 'mine']);
  });

  it('does nothing when disabled', async () => {
    renderHook(() => useDesktopImport(args({ enabled: false })));
    await settle(60_000);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('retries a failed save on a bounded backoff without a layout change', async () => {
    patchMock.mockResolvedValue(null);
    renderHook(() => useDesktopImport(args()));
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < IMPORT_RETRY_MS.length; i++) {
      await settle(IMPORT_RETRY_MS[i] + SETTLED);
      expect(patchMock).toHaveBeenCalledTimes(i + 2);
    }
    await settle(120_000);
    expect(patchMock).toHaveBeenCalledTimes(IMPORT_RETRY_MS.length + 1);
  });

  it('arms no retry when the save rejects after the hook is gone', async () => {
    let reject: () => void = () => {};
    patchMock.mockReturnValue(new Promise((_, r) => { reject = () => r(new Error('late')); }));
    const view = renderHook(() => useDesktopImport(args()));
    await settle();
    view.unmount();
    await act(async () => { reject(); await vi.advanceTimersByTimeAsync(0); });
    await settle(120_000);
    expect(patchMock).toHaveBeenCalledTimes(1);
  });

  it('arms no retry when the hook is disabled before the save fails', async () => {
    let resolve: (v: null) => void = () => {};
    patchMock.mockReturnValue(new Promise(r => { resolve = r; }));
    const view = renderHook(({ on }) => useDesktopImport(args({ enabled: on })), { initialProps: { on: true } });
    await settle();
    view.rerender({ on: false });
    await act(async () => { resolve(null); await vi.advanceTimersByTimeAsync(0); });
    await settle(120_000);
    expect(patchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps one retry budget across refetches of the same import', async () => {
    patchMock.mockResolvedValue(null);
    const view = renderHook(({ p }) => useDesktopImport(args({ pending: p })), { initialProps: { p: pending } });
    await settle();
    await settle(IMPORT_RETRY_MS[0] + SETTLED);
    expect(patchMock).toHaveBeenCalledTimes(2);
    // A refetch hands back an equal import in a new object: the schedule and attempt count carry on.
    view.rerender({ p: { ...pending, widgets: [...pending.widgets] } });
    await settle(IMPORT_RETRY_MS[1] + SETTLED);
    for (let i = 2; i < IMPORT_RETRY_MS.length; i++) await settle(IMPORT_RETRY_MS[i] + SETTLED);
    await settle(120_000);
    expect(patchMock).toHaveBeenCalledTimes(IMPORT_RETRY_MS.length + 1);
  });

  it('waits for a window that has no size yet', async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
    renderHook(() => useDesktopImport(args()));
    await settle(2_000);
    expect(patchMock).not.toHaveBeenCalled();
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
    await settle();
    expect(patchMock).toHaveBeenCalledOnce();
  });

  it('waits for the host to start listening', async () => {
    let ready = false;
    renderHook(() => useDesktopImport(args({ hostReady: () => ready })));
    await settle(2_000);
    expect(patchMock).not.toHaveBeenCalled();
    ready = true;
    await settle();
    expect(patchMock).toHaveBeenCalledOnce();
  });

  it('plans against the size the window settles at, not the one it opened with', async () => {
    const set = (w: number, h: number) => {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
    };
    set(1920, 1080);
    renderHook(() => useDesktopImport(args()));
    await settle(IMPORT_SETTLE_MS - 100);
    expect(patchMock).not.toHaveBeenCalled();
    set(1920, 1055);
    window.dispatchEvent(new Event('resize'));
    await settle(SETTLED);
    expect(patchMock).toHaveBeenCalledOnce();
    const rows = (patchMock.mock.calls[0][1].layout as PanelLayout).pages[0].widgets.length;
    expect(rows).toBeGreaterThan(0);
    set(1024, 768);
  });

  it('uses the origin the host reports while settling, restarting the wait', async () => {
    renderHook(() => useDesktopImport(args()));
    await settle(IMPORT_SETTLE_MS - 100);
    (window as unknown as { __nexusPanelHost: { setOrigin(o: unknown): void } }).__nexusPanelHost.setOrigin({ originX: 0, originY: 25, fullW: 2560, fullH: 1440 });
    await settle(IMPORT_SETTLE_MS - 50);
    expect(patchMock).not.toHaveBeenCalled();
    await settle(SETTLED);
    expect(patchMock).toHaveBeenCalledOnce();
  });

  it('starts again on a later trigger after giving up', async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
    renderHook(() => useDesktopImport(args()));
    await settle(IMPORT_SETTLE_MS * (IMPORT_MAX_WAITS + 5));
    expect(patchMock).not.toHaveBeenCalled();
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
    await act(async () => { window.dispatchEvent(new Event('resize')); await vi.advanceTimersByTimeAsync(SETTLED); });
    expect(patchMock).toHaveBeenCalledOnce();
  });

  it('places a later import with a new key after a save went through', async () => {
    const view = renderHook(({ p }) => useDesktopImport(args({ pending: p })), { initialProps: { p: pending as DesktopImportDto | null } });
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(1);
    view.rerender({ p: null });
    await settle();
    view.rerender({ p: { ...pending, widgets: [{ ...pending.widgets[0], id: 'next' }] } });
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(2);
  });

  it('does not place the same import twice while the record still carries it', async () => {
    const view = renderHook(({ p }) => useDesktopImport(args({ pending: p })), { initialProps: { p: pending } });
    await settle();
    view.rerender({ p: { ...pending, widgets: [...pending.widgets] } });
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(1);
  });

  it('lets a replacing instance place once a stale save fails', async () => {
    let fail: (v: null) => void = () => {};
    patchMock.mockReturnValueOnce(new Promise(r => { fail = r; })).mockResolvedValue({ id: 'rec' });
    const view = renderHook(({ id }) => useDesktopImport(args({ deviceId: id })), { initialProps: { id: 'rec' } });
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(1);
    view.rerender({ id: 'other' });
    await settle();
    expect(patchMock).toHaveBeenCalledTimes(1);
    await act(async () => { fail(null); await vi.advanceTimersByTimeAsync(SETTLED); });
    expect(patchMock).toHaveBeenCalledTimes(2);
  });
});
