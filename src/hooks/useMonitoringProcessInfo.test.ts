import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoringProcessInfo } from './useMonitoringProcessInfo';
import type { ProcessInfoFetchResult } from '../api/monitoringProcessInfo';

const fetchMock = vi.fn<(name: string) => Promise<ProcessInfoFetchResult>>();
vi.mock('../api/monitoringProcessInfo', () => ({
  fetchMonitoringProcessInfo: (name: string) => fetchMock(name),
}));

function response(over: Partial<ProcessInfoFetchResult['data']> = {}): ProcessInfoFetchResult {
  return {
    data: { supported: true, name: 'chrome.exe', instanceCount: 1, ...over },
    mocked: false,
    unsupported: false,
  };
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
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(response());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMonitoringProcessInfo', () => {
  it('fetches the given process name when enabled', async () => {
    renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledWith('chrome.exe');
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMonitoringProcessInfo(false, 'chrome.exe'));
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the resolved data', async () => {
    fetchMock.mockResolvedValue(response({ instanceCount: 3, path: 'C:\\chrome.exe' }));
    const { result } = renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    expect(result.current.data?.instanceCount).toBe(3);
    expect(result.current.data?.path).toBe('C:\\chrome.exe');
    expect(result.current.loading).toBe(false);
  });

  it('reports mocked from the fetch result', async () => {
    fetchMock.mockResolvedValue({ data: response().data, mocked: true, unsupported: false });
    const { result } = renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    expect(result.current.mocked).toBe(true);
  });

  it('resets to loading with no stale data when the name changes', async () => {
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useMonitoringProcessInfo(true, name),
      { initialProps: { name: 'chrome.exe' } },
    );
    await advance(0);
    expect(result.current.data?.name).toBe('chrome.exe');

    let resolveNext!: (v: ProcessInfoFetchResult) => void;
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveNext = res; }));
    rerender({ name: 'Discord.exe' });

    expect(result.current.data).toBeNull();

    await act(async () => { resolveNext(response({ name: 'Discord.exe' })); await Promise.resolve(); });
    expect(result.current.data?.name).toBe('Discord.exe');
  });

  it('stops polling once the route reports unsupported', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result } = renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    expect(result.current.supported).toBe(false);

    fetchMock.mockClear();
    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backs off to a slower retry cadence after a failure, then resumes normal polling on success', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    expect(result.current.error).toBe(true);

    fetchMock.mockClear();
    await advance(5_000);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(response());
    await advance(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(false);
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMonitoringProcessInfo(true, 'chrome.exe'));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
