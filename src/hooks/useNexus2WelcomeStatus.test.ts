import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNexus2WelcomeStatus } from './useNexus2WelcomeStatus';
import type { Nexus2StatusResponse } from '../api/migration';

// fetchNexus2Status is the hook's only I/O; flip its resolved value to
// simulate the service being reachable/unreachable and pending/completed.
const fetchMock = vi.fn<() => Promise<Nexus2StatusResponse | null>>();
vi.mock('../api/migration', () => ({
  fetchNexus2Status: () => fetchMock(),
}));

const PENDING: Nexus2StatusResponse = {
  detected: true,
  importAvailable: true,
  deviceEligible: true,
  version: '2.16.0',
  autostartTaskPresent: true,
  running: true,
  pending: true,
};

const COMPLETED: Nexus2StatusResponse = {
  detected: true,
  importAvailable: true,
  deviceEligible: true,
  version: '2.16.0',
  autostartTaskPresent: true,
  running: false,
  pending: false,
};

// Flush the mount effect's fetch (and any queued retry timers).
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNexus2WelcomeStatus', () => {
  it('starts unknown and resolves to pending when the payload reports pending:true', async () => {
    fetchMock.mockResolvedValue(PENDING);
    const { result } = renderHook(() => useNexus2WelcomeStatus());
    expect(result.current.status).toBe('unknown');

    await settle();
    expect(result.current.status).toBe('pending');
    expect(result.current.payload).toEqual(PENDING);
  });

  it('resolves to completed when the payload reports pending:false', async () => {
    fetchMock.mockResolvedValue(COMPLETED);
    const { result } = renderHook(() => useNexus2WelcomeStatus());

    await settle();
    expect(result.current.status).toBe('completed');
    expect(result.current.payload).toEqual(COMPLETED);
  });

  it('passes the running field through unchanged, in either state', async () => {
    fetchMock.mockResolvedValue(PENDING);
    const { result: runningResult } = renderHook(() => useNexus2WelcomeStatus());
    await settle();
    expect(runningResult.current.payload?.running).toBe(true);

    fetchMock.mockResolvedValue(COMPLETED);
    const { result: notRunningResult } = renderHook(() => useNexus2WelcomeStatus());
    await settle();
    expect(notRunningResult.current.payload?.running).toBe(false);
  });

  it('retries a null response and succeeds once the service answers', async () => {
    fetchMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(PENDING);
    const { result } = renderHook(() => useNexus2WelcomeStatus());

    await settle();
    expect(result.current.status).toBe('unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('unknown');

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('pending');
  });

  it('fails open to completed once the retry bound is exhausted', async () => {
    fetchMock.mockResolvedValue(null);
    const { result } = renderHook(() => useNexus2WelcomeStatus());

    await settle();
    for (let i = 0; i < 4; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    }

    expect(result.current.status).toBe('completed');
    expect(result.current.payload).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
