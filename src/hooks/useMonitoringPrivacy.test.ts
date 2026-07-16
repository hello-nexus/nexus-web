import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoringPrivacy } from './useMonitoringPrivacy';
import type { PrivacyQuery, PrivacyResponse } from '../api/monitoringPrivacy';

const fetchMock = vi.fn<(query: PrivacyQuery) => Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringPrivacy', () => ({
  fetchMonitoringPrivacy: (query: PrivacyQuery) => fetchMock(query),
}));

const NOW = new Date('2026-07-16T12:00:00Z').getTime();

function emptyResp(): PrivacyResponse {
  return { supported: true, retentionDays: 7, sessions: [] };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMonitoringPrivacy', () => {
  it('fetches on mount with a from/to window ending now', async () => {
    renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 2 * 3_600_000, to: NOW });
  });

  it('polls every ~5s while enabled', async () => {
    renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMonitoringPrivacy(false));
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the resolved sessions and asOfMs', async () => {
    const sessions = [{ app: 'C:\\chrome.exe', capability: 'webcam' as const, start: NOW - 1000, end: null }];
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 7, sessions }, mocked: false, unsupported: false });

    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.asOfMs).toBe(NOW);
  });

  it('reports mocked from the fetch result', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: true, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    expect(result.current.mocked).toBe(true);
  });

  it('stops polling once the route reports unsupported', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(result.current.supported).toBe(false);
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backs off to a slower retry cadence after a failure, then resumes normal polling on success', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    // Nothing at the normal 5s cadence - backed off.
    await advance(5_000);
    expect(fetchMock).not.toHaveBeenCalled();

    // Retried once the backoff elapses (30s from the failed attempt).
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    await advance(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(false);

    // Normal cadence resumes after the successful retry.
    fetchMock.mockClear();
    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not start a new fetch while the previous one is still pending', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);

    renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The normal poll interval elapses while the first request is still
    // pending - the next attempt only fires after it resolves, never overlapping it.
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ data: emptyResp(), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    await advance(0);

    fetchMock.mockClear();
    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a stale response from a torn-down instance (enabled toggled off then on) does not overwrite a newer instance\'s state', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);
    // Configured before the second instance's request fires, so whichever
    // call actually reaches the mock (request B) resolves with this.
    const secondSessions = [{ app: 'C:\\second.exe', capability: 'webcam' as const, start: NOW, end: null }];
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 7, sessions: secondSessions }, mocked: false, unsupported: false });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useMonitoringPrivacy(enabled),
      { initialProps: { enabled: true } },
    );
    await advance(0);
    // Request A (from the first instance) is in flight.

    // Toggled off then back on before A resolves - the second instance fires
    // its own request B.
    rerender({ enabled: false });
    rerender({ enabled: true });
    await advance(0);

    expect(result.current.sessions).toEqual(secondSessions);

    // Request A (older, from the torn-down first instance) finally resolves.
    await act(async () => {
      resolveFirst({ data: { supported: true, retentionDays: 7, sessions: [{ app: 'C:\\first.exe', capability: 'webcam' as const, start: NOW - 5_000, end: null }] }, mocked: false, unsupported: false });
      await Promise.resolve();
    });

    // Dropped - must not overwrite request B's already-committed state.
    expect(result.current.sessions).toEqual(secondSessions);
  });
});
