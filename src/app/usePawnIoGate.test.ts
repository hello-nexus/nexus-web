import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PawnIoState, PawnIoStatus } from '../api/pawnio';

const fetchPawnIoStatus = vi.fn();
vi.mock('../api/pawnio', () => ({
  fetchPawnIoStatus: (...args: unknown[]) => fetchPawnIoStatus(...args),
}));

import { BOOT_POLL_WINDOW_MS, nextPawnIoStatus, usePawnIoGate } from './usePawnIoGate';

function status(state: PawnIoState): PawnIoStatus {
  return { installed: true, open: state === 'ok', state, errorCode: null, fixAction: 'none', fixing: false, restarting: false };
}

beforeEach(() => { fetchPawnIoStatus.mockReset(); });

describe('nextPawnIoStatus', () => {
  it('keeps what was known when a read fails', () => {
    expect(nextPawnIoStatus(null, null)).toBeNull();
    expect(nextPawnIoStatus(status('blocked'), null)?.state).toBe('blocked');
  });

  it('takes a positive report', () => {
    expect(nextPawnIoStatus(status('blocked'), status('ok'))?.state).toBe('ok');
  });
});

describe('usePawnIoGate', () => {
  it('never shows before the read answers (no gate on the first render)', () => {
    fetchPawnIoStatus.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => usePawnIoGate(true));
    expect(result.current.show).toBe(false);
  });

  it('never shows when the read fails', async () => {
    fetchPawnIoStatus.mockResolvedValue(null);
    const { result } = renderHook(() => usePawnIoGate(true));
    await waitFor(() => expect(fetchPawnIoStatus).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('does not read at all while disabled', () => {
    const { result } = renderHook(() => usePawnIoGate(false));
    expect(fetchPawnIoStatus).not.toHaveBeenCalled();
    expect(result.current.show).toBe(false);
  });

  it('never shows for ok', async () => {
    fetchPawnIoStatus.mockResolvedValue(status('ok'));
    const { result } = renderHook(() => usePawnIoGate(true));
    await waitFor(() => expect(fetchPawnIoStatus).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('shows for a not-ok report and leaves once a poll reports ok', async () => {
    vi.useFakeTimers();
    try {
      fetchPawnIoStatus.mockResolvedValue(status('notInstalled'));
      const { result } = renderHook(() => usePawnIoGate(true));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(result.current.show).toBe(true);
      fetchPawnIoStatus.mockResolvedValue(status('ok'));
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(result.current.show).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('polls a healthy PC for the boot window (two minutes) only, then stops', async () => {
    vi.useFakeTimers();
    try {
      fetchPawnIoStatus.mockResolvedValue(status('ok'));
      renderHook(() => usePawnIoGate(true));
      await act(async () => { await vi.advanceTimersByTimeAsync(BOOT_POLL_WINDOW_MS); });
      const calls = fetchPawnIoStatus.mock.calls.length;
      expect(calls).toBeGreaterThan(20);
      expect(BOOT_POLL_WINDOW_MS).toBe(120_000);
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(fetchPawnIoStatus.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the gate when the boot check latches after the window opened', async () => {
    vi.useFakeTimers();
    try {
      fetchPawnIoStatus.mockResolvedValue(status('ok'));
      const { result } = renderHook(() => usePawnIoGate(true));
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(result.current.show).toBe(false);
      fetchPawnIoStatus.mockResolvedValue(status('notInstalled'));
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(result.current.show).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the success hold when the service goes offline, so a reconnect with ok shows no gate', async () => {
    fetchPawnIoStatus.mockResolvedValue(status('notRunning'));
    const { result, rerender } = renderHook(({ on }) => usePawnIoGate(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.show).toBe(true));
    act(() => { result.current.setStatus(status('ok')); result.current.onFixed(); });
    expect(result.current.show).toBe(true);
    rerender({ on: false });
    fetchPawnIoStatus.mockResolvedValue(status('ok'));
    rerender({ on: true });
    await waitFor(() => expect(fetchPawnIoStatus).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('holds the screen for the success beat after a fix, until continue', async () => {
    fetchPawnIoStatus.mockResolvedValue(status('notRunning'));
    const { result } = renderHook(() => usePawnIoGate(true));
    await waitFor(() => expect(result.current.show).toBe(true));
    act(() => { result.current.setStatus(status('ok')); result.current.onFixed(); });
    expect(result.current.show).toBe(true);
    act(() => result.current.onContinue());
    expect(result.current.show).toBe(false);
  });
});
