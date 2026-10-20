import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useServiceStatus, LIVENESS_WINDOW_MS } from './useServiceStatus';
import { HOST_DISPLAY_OFFLINE_GRACE_MS, PHONE_OFFLINE_GRACE_MS, markServiceAnswered, type OfflineHold } from '../lib/serviceLiveness';
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
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  // Every test starts with a long-stale sign of life.
  now = 0;
  markServiceAnswered();
  now = 1_000_000;
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

  it('never holds the boot checking state: first failure surfaces offline despite a grace', async () => {
    // The service is down from the start - the grace has no good state to
    // hold, so the very first miss must flip offline instead of leaving the
    // page blank for the grace window (the my.hellonexus.com dark-gate bug).
    pingMock.mockResolvedValue(null);
    const { result } = renderHook(() => useServiceStatus(true, HOST_DISPLAY_OFFLINE_GRACE_MS));
    await settle();
    expect(result.current.state).toBe('offline');
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

describe('useServiceStatus hold policy', () => {
  async function heldOnline(hold: OfflineHold) {
    pingMock.mockResolvedValue(OK);
    const hook = renderHook(({ hold }) => useServiceStatus(true, PHONE_OFFLINE_GRACE_MS, hold), { initialProps: { hold } });
    await settle();
    expect(hook.result.current.state).toBe('online');
    pingMock.mockResolvedValue(null);
    return hook;
  }

  it('gives no hold in never mode', async () => {
    const { result } = await heldOnline('never');
    markServiceAnswered();
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
    expect(result.current.ping).toBeNull();
  });

  it('holds while-live misses as long as REST responses keep completing, with no frames', async () => {
    const { result } = await heldOnline('while-live');
    for (let elapsed = 0; elapsed < PHONE_OFFLINE_GRACE_MS - LIVENESS_WINDOW_MS; elapsed += LIVENESS_WINDOW_MS - 1) {
      markServiceAnswered();
      now += LIVENESS_WINDOW_MS - 1;
      await poll(result.current.retry);
      expect(result.current.state).toBe('online');
    }
    expect(result.current.ping).not.toBeNull();
  });

  it('flips a while-live hold offline at the first miss once the last sign of life is stale', async () => {
    const { result } = await heldOnline('while-live');
    markServiceAnswered();
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
    now += LIVENESS_WINDOW_MS;
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
  });

  it('gives a while-live miss no hold when the service has been silent', async () => {
    const { result } = await heldOnline('while-live');
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
  });

  it('caps a while-live hold even while signs of life keep arriving', async () => {
    const { result } = await heldOnline('while-live');
    markServiceAnswered();
    await poll(result.current.retry);
    now += PHONE_OFFLINE_GRACE_MS;
    markServiceAnswered();
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
  });

  it('ends a hold at once when the hold condition drops, without waiting for a poll', async () => {
    const { result, rerender } = await heldOnline('while-live');
    markServiceAnswered();
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
    rerender({ hold: 'never' });
    expect(result.current.state).toBe('offline-installed');
    expect(result.current.ping).toBeNull();
  });

  it('stays offline when the transport reopens during a hold, until a ping answers', async () => {
    const { result, rerender } = await heldOnline('while-live');
    markServiceAnswered();
    await poll(result.current.retry);
    rerender({ hold: 'never' });
    await settle();
    rerender({ hold: 'while-live' });
    expect(result.current.state).toBe('offline-installed');
    markServiceAnswered();
    await poll(result.current.retry);
    expect(result.current.state).toBe('offline-installed');
    pingMock.mockResolvedValue(OK);
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
  });

  it('holds in always mode with no sign of life', async () => {
    const { result } = await heldOnline('always');
    await poll(result.current.retry);
    now += LIVENESS_WINDOW_MS * 2;
    await poll(result.current.retry);
    expect(result.current.state).toBe('online');
  });

  it('a recovered ping clears the hold so a later drop of the condition does not flip offline', async () => {
    const { result, rerender } = await heldOnline('while-live');
    markServiceAnswered();
    await poll(result.current.retry);
    pingMock.mockResolvedValue(OK);
    await poll(result.current.retry);
    rerender({ hold: 'never' });
    expect(result.current.state).toBe('online');
  });
});
