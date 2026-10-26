import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { IMPORT_RETRY_MS, useDesktopImport } from './useDesktopImport';

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
  ({ enabled: true, deviceId: 'rec', pending, layout: layoutOf([]), paddingPercent: 100, grid, ...over });

beforeEach(() => { vi.useFakeTimers(); patchMock.mockReset().mockResolvedValue({ id: 'rec' }); });
afterEach(() => vi.useRealTimers());

const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

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
      await settle(IMPORT_RETRY_MS[i]);
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
    await settle(IMPORT_RETRY_MS[0]);
    expect(patchMock).toHaveBeenCalledTimes(2);
    // A refetch hands back an equal import in a new object: the schedule and attempt count carry on.
    view.rerender({ p: { ...pending, widgets: [...pending.widgets] } });
    await settle(IMPORT_RETRY_MS[1]);
    for (let i = 2; i < IMPORT_RETRY_MS.length; i++) await settle(IMPORT_RETRY_MS[i]);
    await settle(120_000);
    expect(patchMock).toHaveBeenCalledTimes(IMPORT_RETRY_MS.length + 1);
  });
});
