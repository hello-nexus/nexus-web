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

  it('stops polling once a real fetch failure sets error', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);

    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMonitoringPrivacy(true));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a stale response that resolves after a newer poll already landed', async () => {
    let resolveFirst!: (v: { data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }) => void;
    const first = new Promise<{ data: PrivacyResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolveFirst = res; });
    fetchMock.mockReturnValueOnce(first);
    fetchMock.mockResolvedValue({ data: { supported: true, retentionDays: 7, sessions: [{ app: 'C:\\second.exe', capability: 'webcam' as const, start: 1, end: null }] }, mocked: false, unsupported: false });

    const { result } = renderHook(() => useMonitoringPrivacy(true));
    await advance(5_000);

    await act(async () => {
      resolveFirst({ data: { supported: true, retentionDays: 7, sessions: [{ app: 'C:\\first.exe', capability: 'webcam' as const, start: 1, end: null }] }, mocked: false, unsupported: false });
      await Promise.resolve();
    });

    expect(result.current.sessions[0]?.app).toBe('C:\\second.exe');
  });
});
