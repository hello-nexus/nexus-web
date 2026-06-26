import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useServiceStatus, HOST_DISPLAY_OFFLINE_GRACE_MS } from './useServiceStatus';
import type { PingResponse } from '../api/service';

// pingService is the only I/O the hook performs; flip its resolved value to
// simulate the service going reachable / unreachable.
const pingMock = vi.fn<() => Promise<PingResponse | null>>();
vi.mock('../api/service', () => ({
  pingService: () => pingMock(),
}));
vi.mock('./useServiceLaunch', () => ({
  isLaunching: () => false,
  resolveLaunch: vi.fn(),
  useLaunchState: () => false,
}));

const OK: PingResponse = { service: 'nexus', version: '1', initialized: true };

// Drive one poll cycle and flush the awaited pingService microtask chain.
async function poll(retry: () => void): Promise<void> {
  await act(async () => {
    retry();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Flush the mount effect's first tick.
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  pingMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useServiceStatus offline grace', () => {
  it('holds the last good state through a transient miss and flips only after the grace', async () => {
    pingMock.mockResolvedValue(OK);
    const { result } = renderHook(() => useServiceStatus(true, HOST_DISPLAY_OFFLINE_GRACE_MS));
    await settle();
    expect(result.current.state).toBe('online');

    // Service stops answering; inside the grace window the panel stays online.
    pingMock.mockResolvedValue(null);
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
    expect(result.current.ping).not.toBeNull();

    // Still within grace after a second miss.
    now += HOST_DISPLAY_OFFLINE_GRACE_MS - 1;
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');

    // Past the grace: the next miss flips offline.
    now += 2;
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
    expect(result.current.ping).toBeNull();
  });

  it('flips offline on the first miss when no grace is set', async () => {
    pingMock.mockResolvedValue(OK);
    const { result } = renderHook(() => useServiceStatus(true, 0));
    await settle();
    expect(result.current.state).toBe('online');

    pingMock.mockResolvedValue(null);
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
  });

  it('resets the grace streak after the service recovers', async () => {
    pingMock.mockResolvedValue(OK);
    const { result } = renderHook(() => useServiceStatus(true, HOST_DISPLAY_OFFLINE_GRACE_MS));
    await settle();

    // A miss starts the streak...
    pingMock.mockResolvedValue(null);
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');

    // ...a success clears it...
    pingMock.mockResolvedValue(OK);
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');

    // ...so a later miss restarts the full grace rather than counting the old one.
    now += HOST_DISPLAY_OFFLINE_GRACE_MS - 1;
    pingMock.mockResolvedValue(null);
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
  });
});
