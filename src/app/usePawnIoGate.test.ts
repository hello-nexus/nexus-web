import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PawnIoState, PawnIoStatus } from '../api/pawnio';

const fetchPawnIoStatus = vi.fn();
vi.mock('../api/pawnio', () => ({
  fetchPawnIoStatus: (...args: unknown[]) => fetchPawnIoStatus(...args),
}));

import { nextPawnIoStatus, usePawnIoGate } from './usePawnIoGate';

function status(state: PawnIoState): PawnIoStatus {
  return { installed: true, open: state === 'ok', state, errorCode: null, fixAction: 'none', fixing: false };
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
