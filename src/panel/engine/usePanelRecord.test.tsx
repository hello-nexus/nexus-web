import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchMock = vi.fn();

vi.mock('../../api/panel', () => ({
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));

import { usePanelRecord } from './usePanelRecord';

const RECORD = { id: 'dev1', displayName: 'Y70', firstSeenAt: 0, lastSeenAt: 0 };

beforeEach(() => {
  fetchMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('usePanelRecord', () => {
  it('holds the record it read', async () => {
    fetchMock.mockResolvedValue({ found: true, record: RECORD });

    const { result } = renderHook(() => usePanelRecord('dev1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.record).toEqual(RECORD);
    expect(result.current.missing).toBe(false);
  });

  it('retries an unreachable service with backoff until it answers', async () => {
    fetchMock.mockResolvedValue({ found: false, status: 0 });

    const { result } = renderHook(() => usePanelRecord('dev1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.record).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue({ found: true, record: RECORD });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(result.current.record).toEqual(RECORD);
  });

  it('keeps the record it has when a later read fails', async () => {
    fetchMock.mockResolvedValue({ found: true, record: RECORD });
    const { result } = renderHook(() => usePanelRecord('dev1'));
    await waitFor(() => expect(result.current.record).toEqual(RECORD));

    fetchMock.mockResolvedValue({ found: false, status: 0 });
    await act(async () => { result.current.refetch(); });

    expect(result.current.record).toEqual(RECORD);
    expect(result.current.missing).toBe(false);
  });

  it('reports a 404 as missing without retrying', async () => {
    fetchMock.mockResolvedValue({ found: false, status: 404 });

    const { result } = renderHook(() => usePanelRecord('dev1'));
    await waitFor(() => expect(result.current.missing).toBe(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fetch without a device id', () => {
    renderHook(() => usePanelRecord(null));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
