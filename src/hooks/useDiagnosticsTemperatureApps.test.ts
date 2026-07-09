import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDiagnosticsTemperatureApps } from './useDiagnosticsTemperatureApps';
import type { DiagnosticsTemperatureAppsResponse, DiagnosticsTemperatureQuery } from '../api/diagnostics';

const fetchMock = vi.fn<(query: DiagnosticsTemperatureQuery) => Promise<{ data: DiagnosticsTemperatureAppsResponse | null; mocked: boolean }>>();
vi.mock('../api/diagnostics', () => ({
  fetchDiagnosticsTemperatureApps: (query: DiagnosticsTemperatureQuery) => fetchMock(query),
}));

function response(bucketCount: number): DiagnosticsTemperatureAppsResponse {
  return {
    supported: true,
    bucketMinutes: 30,
    buckets: Array.from({ length: bucketCount }, (_, i) => ({
      startUtcMs: i * 1_800_000,
      apps: [{ appName: 'Test App', appId: 'Test App', ms: 600_000 }],
    })),
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDiagnosticsTemperatureApps', () => {
  it('does not fetch while disabled', async () => {
    const query: DiagnosticsTemperatureQuery = { hours: 168 };
    const { result } = renderHook(() => useDiagnosticsTemperatureApps(false, query));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches with an hours query once enabled', async () => {
    fetchMock.mockResolvedValue({ data: response(2), mocked: false });
    const query: DiagnosticsTemperatureQuery = { hours: 168 };
    const { result } = renderHook(() => useDiagnosticsTemperatureApps(true, query));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith({ hours: 168 });
    expect(result.current.data?.buckets.length).toBe(2);
  });

  it('fetches with a date query and not hours when in day mode', async () => {
    fetchMock.mockResolvedValue({ data: response(1), mocked: false });
    const query: DiagnosticsTemperatureQuery = { date: '2026-07-05' };
    renderHook(() => useDiagnosticsTemperatureApps(true, query));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith({ date: '2026-07-05' });
  });

  it('fetches once enabled flips from false to true for the same query', async () => {
    fetchMock.mockResolvedValue({ data: response(1), mocked: false });
    const query: DiagnosticsTemperatureQuery = { hours: 168 };
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDiagnosticsTemperatureApps(enabled, query),
      { initialProps: { enabled: false } },
    );
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => rerender({ enabled: true }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith({ hours: 168 });
  });

  it('refetches when the query changes while enabled', async () => {
    fetchMock.mockResolvedValue({ data: response(1), mocked: false });
    const { rerender } = renderHook(
      ({ query }: { query: DiagnosticsTemperatureQuery }) => useDiagnosticsTemperatureApps(true, query),
      { initialProps: { query: { hours: 168 } as DiagnosticsTemperatureQuery } },
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => rerender({ query: { date: '2026-07-05' } }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith({ date: '2026-07-05' });
  });
});
