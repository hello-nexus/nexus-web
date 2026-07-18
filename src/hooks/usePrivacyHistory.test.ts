import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrivacyHistory } from './usePrivacyHistory';
import type { PrivacyQuery, PrivacyResponse } from '../api/monitoringPrivacy';

const fetchMock = vi.fn<(query: PrivacyQuery) => Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringPrivacy', () => ({
  fetchMonitoringPrivacy: (query: PrivacyQuery) => fetchMock(query),
}));

const NOW = new Date('2026-07-16T12:00:00Z').getTime();
const RETENTION_MS = 30 * 86_400_000;

function emptyResp(retentionDays = 30): PrivacyResponse {
  return { supported: true, retentionDays, sessions: [] };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

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

describe('usePrivacyHistory', () => {
  it('does not fetch while closed', async () => {
    renderHook(() => usePrivacyHistory(false));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a 30-day window ending now once opened', async () => {
    renderHook(() => usePrivacyHistory(true));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - RETENTION_MS, to: NOW });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on a re-render while staying open', async () => {
    const { rerender } = renderHook(() => usePrivacyHistory(true));
    await flush();
    fetchMock.mockClear();
    rerender();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the resolved sessions, mocked flag, and reported retentionDays', async () => {
    const sessions = [{ app: 'C:\\chrome.exe', capability: 'webcam' as const, start: NOW - 1000, end: null }];
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 14, sessions }, mocked: true, unsupported: false });

    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();

    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.retentionDays).toBe(14);
    expect(result.current.mocked).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('reports unsupported when the route returns no route', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();
    expect(result.current.supported).toBe(false);
  });

  it('reports an error on a real fetch failure', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();
    expect(result.current.error).toBe(true);
  });

  it('reload() re-fetches on demand', async () => {
    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();
    fetchMock.mockClear();

    act(() => result.current.reload());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reload clears a previous error once the retry succeeds', async () => {
    fetchMock.mockResolvedValueOnce({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();
    expect(result.current.error).toBe(true);

    fetchMock.mockResolvedValueOnce({ data: emptyResp(), mocked: false, unsupported: false });
    act(() => result.current.reload());
    await flush();

    expect(result.current.error).toBe(false);
  });

  it('drops a stale response from an earlier request once a newer one has committed', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);
    const secondSessions = [{ app: 'C:\\second.exe', capability: 'webcam' as const, start: NOW, end: null }];
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 30, sessions: secondSessions }, mocked: false, unsupported: false });

    const { result } = renderHook(() => usePrivacyHistory(true));
    await flush();
    // The first request is still in flight - reload fires a second one.
    act(() => result.current.reload());
    await flush();

    expect(result.current.sessions).toEqual(secondSessions);

    await act(async () => {
      resolveFirst({ data: { supported: true, retentionDays: 30, sessions: [{ app: 'C:\\first.exe', capability: 'webcam' as const, start: NOW - 5_000, end: null }] }, mocked: false, unsupported: false });
      await Promise.resolve();
    });

    expect(result.current.sessions).toEqual(secondSessions);
  });

  it('does not update state after unmount', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);

    const { unmount } = renderHook(() => usePrivacyHistory(true));
    await flush();
    unmount();

    await act(async () => {
      resolveFirst({ data: emptyResp(), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    // No assertion beyond "this does not throw" - React would warn on a
    // state update after unmount if the mountedRef guard were missing.
  });
});
