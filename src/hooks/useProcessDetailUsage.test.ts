import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessDetailUsage } from './useProcessDetailUsage';
import type { MetricHistoryAppsQuery, MetricHistoryAppsResponse } from '../api/monitoringHistoryApps';

const fetchMock = vi.fn<(query: MetricHistoryAppsQuery) => Promise<{ data: MetricHistoryAppsResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringHistoryApps', () => ({
  fetchMonitoringHistoryApps: (query: MetricHistoryAppsQuery) => fetchMock(query),
}));

const NOW = 10_000_000;
const MINUTE = 60_000;

function resp(name: string, value: number): MetricHistoryAppsResponse {
  return { supported: true, apps: [{ name, avg: value, max: value, points: [{ t: NOW, avg: value }] }] };
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
  fetchMock.mockImplementation(async query => ({ data: resp(query.process ?? '', 1), mocked: false, unsupported: false }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useProcessDetailUsage', () => {
  it('fetches cpu, memory, gpu, and vram for the named process, each scoped by the process filter, while enabled', async () => {
    renderHook(() => useProcessDetailUsage('chrome.exe', NOW - MINUTE, NOW, true, false));
    await advance(200);

    const seriesRequested = fetchMock.mock.calls.map(([q]) => q.series).sort();
    expect(seriesRequested).toEqual(['cpu', 'gpu', 'memory', 'vram']);
    for (const [query] of fetchMock.mock.calls) {
      expect(query.process).toBe('chrome.exe');
    }
  });

  it('maps each metric onto its own named result', async () => {
    const { result } = renderHook(() => useProcessDetailUsage('chrome.exe', NOW - MINUTE, NOW, true, false));
    await advance(200);

    expect(result.current.cpu.apps[0]?.name).toBe('chrome.exe');
    expect(result.current.memory.apps[0]?.name).toBe('chrome.exe');
    expect(result.current.gpu.apps[0]?.name).toBe('chrome.exe');
    expect(result.current.vram.apps[0]?.name).toBe('chrome.exe');
  });

  it('does not fetch while disabled (the isLive === true case)', async () => {
    renderHook(() => useProcessDetailUsage('chrome.exe', NOW - MINUTE, NOW, false, false));
    await advance(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches even while following, as long as enabled is true - a frame pinned by a chart click without leaving live', async () => {
    // The caller (ProcessDetailSlideout) derives `enabled` from its own
    // isLive (following AND nothing pinned), not from `following` alone -
    // enabled=true with following=true is exactly the "pinned while still
    // following" state a plain hero-chart click produces.
    renderHook(() => useProcessDetailUsage('chrome.exe', NOW - MINUTE, NOW, true, true));
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('starts fetching the moment enabled flips true (the viewport detaches from live, or a frame gets pinned)', async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useProcessDetailUsage('chrome.exe', NOW - MINUTE, NOW, enabled, false),
      { initialProps: { enabled: false } },
    );
    await advance(200);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refetches all four metrics when the process name changes while enabled', async () => {
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useProcessDetailUsage(name, NOW - MINUTE, NOW, true, false),
      { initialProps: { name: 'chrome.exe' } },
    );
    await advance(200);
    fetchMock.mockClear();

    rerender({ name: 'Nexus' });
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [query] of fetchMock.mock.calls) {
      expect(query.process).toBe('Nexus');
    }
  });
});
