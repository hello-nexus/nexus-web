import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoringPrivacy } from './useMonitoringPrivacy';
import type { PrivacyQuery, PrivacyResponse, PrivacySession } from '../api/monitoringPrivacy';

const fetchMock = vi.fn<(query: PrivacyQuery) => Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringPrivacy', () => ({
  fetchMonitoringPrivacy: (query: PrivacyQuery) => fetchMock(query),
}));

// The hook subscribes to exactly one topic ('monitoring/privacy'), mirroring
// useStreamDecks.test.ts's capture idiom. mockConnected backs
// useMultiplex()?.connected for the reconnect-refetch tests.
let capturedPrivacyPush: ((data: unknown) => void) | null = null;
let mockConnected = true;
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedPrivacyPush = enabled ? cb : null;
  },
  useMultiplex: () => ({ connected: mockConnected }),
}));

const NOW = new Date('2026-07-16T12:00:00Z').getTime();

function emptyResp(): PrivacyResponse {
  return { supported: true, retentionDays: 7, sessions: [] };
}

function session(overrides: Partial<PrivacySession> = {}): PrivacySession {
  return { app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null, ...overrides };
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
  capturedPrivacyPush = null;
  mockConnected = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMonitoringPrivacy', () => {
  it('fetches once on mount with a from/to window ending now', async () => {
    renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 2 * 3_600_000, to: NOW });
  });

  it('fetches once on enable and never polls again', async () => {
    renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    await advance(120_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMonitoringPrivacy(false));
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the resolved sessions and asOfMs', async () => {
    const sessions = [session({ app: 'C:\\chrome.exe', start: NOW - 1000 })];
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

  it('reports unsupported and never fetches again, even on a later reconnect', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { rerender } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports error on a fetch failure', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(result.current.error).toBe(true);
  });

  it('reconnect triggers exactly one refetch', async () => {
    const { rerender } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on a steady connection - only on an actual drop-then-reconnect', async () => {
    const { rerender } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    rerender(); // connected stays true throughout - no edge to react to
    await advance(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges a pushed session into the list with no fetch', async () => {
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    act(() => { capturedPrivacyPush?.(session({ app: 'C:\\discord.exe', start: NOW })); });

    expect(result.current.sessions).toEqual([session({ app: 'C:\\discord.exe', start: NOW })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a matching (app, capability, start) session in place - the end push closing a start push', async () => {
    fetchMock.mockResolvedValue({
      data: { supported: true, retentionDays: 7, sessions: [session({ start: NOW - 1000, end: null })] },
      mocked: false, unsupported: false,
    });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    act(() => { capturedPrivacyPush?.(session({ start: NOW - 1000, end: NOW })); });

    expect(result.current.sessions).toEqual([session({ start: NOW - 1000, end: NOW })]);
  });

  it('an unchanged push does not create a new sessions array reference', async () => {
    const initial = session({ start: NOW - 1000, end: null });
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 7, sessions: [initial] }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    const before = result.current.sessions;

    act(() => { capturedPrivacyPush?.(session({ start: NOW - 1000, end: null })); });

    expect(result.current.sessions).toBe(before);
  });

  it('normalises an omitted end key to null, so a replayed open-session push does not create a new reference', async () => {
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    act(() => {
      capturedPrivacyPush?.({ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000 } as PrivacySession);
    });
    const before = result.current.sessions;

    act(() => {
      capturedPrivacyPush?.({ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000 } as PrivacySession);
    });

    expect(result.current.sessions).toBe(before);
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a stale response from a torn-down instance (enabled toggled off then on) does not overwrite a newer instance\'s state', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);
    // Configured before the second instance's request fires, so whichever
    // call actually reaches the mock (request B) resolves with this.
    const secondSessions = [session({ app: 'C:\\second.exe', start: NOW })];
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
      resolveFirst({ data: { supported: true, retentionDays: 7, sessions: [session({ app: 'C:\\first.exe', start: NOW - 5_000 })] }, mocked: false, unsupported: false });
      await Promise.resolve();
    });

    // Dropped - must not overwrite request B's already-committed state.
    expect(result.current.sessions).toEqual(secondSessions);
  });

  it('skips the reconnect-triggered refetch while the initial fetch is still in flight', async () => {
    let resolveFetch!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveFetch = res; }));

    const { rerender } = renderHook(() => useMonitoringPrivacy(true));
    // The mount's own load() is in flight (fetchMock's return value is
    // still pending).
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    // No second concurrent fetch fired while loadInFlightRef was true.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch({ data: emptyResp(), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    await flush();
  });

  it('a push landing while the fetch is in flight survives it, instead of being overwritten by the GET\'s still-open session', async () => {
    let resolveFetch!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveFetch = res; }));

    const { result } = renderHook(() => useMonitoringPrivacy(true));
    // The mount's own load() is in flight.
    act(() => { capturedPrivacyPush?.(session({ app: 'C:\\chrome.exe', start: NOW - 1000, end: NOW - 200 })); });

    await act(async () => {
      // Resolves with the session still open, as of before the end push.
      resolveFetch({
        data: { supported: true, retentionDays: 7, sessions: [session({ app: 'C:\\chrome.exe', start: NOW - 1000, end: null })] },
        mocked: false, unsupported: false,
      });
      await Promise.resolve();
    });
    await flush();

    const match = result.current.sessions.find(s => s.app === 'C:\\chrome.exe');
    expect(match?.end).toBe(NOW - 200);
  });

  it('a push clears a stale error state', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    expect(result.current.error).toBe(true);

    act(() => { capturedPrivacyPush?.(session({ app: 'C:\\chrome.exe', start: NOW })); });

    expect(result.current.error).toBe(false);
  });

  it('retries once after a failed load, recovering on success', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    await advance(30_000); // the one bounded error-retry delay

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(false);
  });

  it('does not schedule a second retry if the one bounded retry also fails', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    fetchMock.mockClear();

    await advance(30_000); // the one retry fires and also fails
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    await advance(120_000); // no further automatic retry - not a poll loop
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('advances asOfMs on a coarse interval so an ended session ages out of "recent" on its own', async () => {
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    const initialAsOf = result.current.asOfMs;

    await advance(60_000); // the asOfMs tick cadence

    expect(result.current.asOfMs).toBeGreaterThan(initialAsOf);
  });
});
