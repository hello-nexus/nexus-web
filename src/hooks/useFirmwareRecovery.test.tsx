import type { ReactElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirmwareStatusItem } from './useFirmwareStatus';
import type { FlashStatus } from './useFlashStatus';

// fetchRecoveryRows is mocked: the cadence and stop-on-unmount are the layer under test.

const fetchMock = vi.fn();
vi.mock('../api/firmwareRecovery', () => ({
  fetchRecoveryRows: () => fetchMock(),
  recoverFirmware: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('../components/common/Toast/Toast', () => ({ useToastSafe: () => ({ push: pushMock }) }));

import { recoverFirmware } from '../api/firmwareRecovery';
import { useRecoverConfirm, useRecoveryRow } from './useFirmwareRecovery';

const ROW = {
  deviceType: 'qseries', firmwareType: 'q60', name: 'HYTE Q60', category: 'cooling',
  currentVersion: '', availableVersion: '1.2.3', updateAvailable: false, availableVersions: [], devImages: [],
  needsRecovery: true, recoveryState: 'ready',
} as FirmwareStatusItem;

describe('useRecoveryRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('fetches on mount, then every 10 s, and stops when unmounted', async () => {
    fetchMock.mockResolvedValue([ROW]);
    const { result, unmount } = renderHook(() => useRecoveryRow(true));
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.item?.name).toBe('HYTE Q60');

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears the item once the service reports no recovery rows', async () => {
    fetchMock.mockResolvedValueOnce([ROW]).mockResolvedValue([]);
    const { result } = renderHook(() => useRecoveryRow(true));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.item).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.item).toBeNull();
  });

  it('keeps the last row when a poll fails', async () => {
    fetchMock.mockResolvedValueOnce([ROW]).mockResolvedValue(null);
    const { result } = renderHook(() => useRecoveryRow(true));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.item).not.toBeNull();
  });

  it('does not poll while disabled', async () => {
    renderHook(() => useRecoveryRow(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useRecoverConfirm', () => {
  const flash = (over: Partial<FlashStatus>): FlashStatus => ({
    active: false, deviceType: 'q60', version: '1.2.3', phase: 'idle', percent: 0, message: '', success: false, error: '', ...over,
  });

  async function startRecovery(initial: FlashStatus) {
    vi.mocked(recoverFirmware).mockResolvedValue({ started: true } as Awaited<ReturnType<typeof recoverFirmware>>);
    const hook = renderHook(({ st }) => useRecoverConfirm(() => {}, st), { initialProps: { st: initial } });
    act(() => hook.result.current.request(ROW));
    await act(async () => {
      (hook.result.current.modal as ReactElement<{ onConfirm: () => void }>).props.onConfirm();
      await Promise.resolve();
    });
    return hook;
  }

  beforeEach(() => pushMock.mockReset());

  it('toasts restored once the started recovery finishes, ignoring a stale earlier "done"', async () => {
    const { rerender } = await startRecovery(flash({ phase: 'done', success: true }));
    expect(pushMock).not.toHaveBeenCalled();

    rerender({ st: flash({ active: true, phase: 'downloading' }) });
    rerender({ st: flash({ phase: 'done', success: true }) });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0].title).toMatch(/devices\.firmware\.recovery\.restored/);
  });

  it('does not toast a failed recovery', async () => {
    const { rerender } = await startRecovery(flash({}));
    rerender({ st: flash({ active: true, phase: 'downloading' }) });
    rerender({ st: flash({ phase: 'failed', error: 'x' }) });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
