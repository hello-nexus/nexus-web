import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDiagnosticsTemperatures } from './useDiagnosticsTemperatures';
import type { DiagnosticsTemperatureQuery, DiagnosticsTemperaturesResponse } from '../api/diagnostics';

const fetchMock = vi.fn<(query: DiagnosticsTemperatureQuery) => Promise<{ data: DiagnosticsTemperaturesResponse | null; mocked: boolean }>>();
vi.mock('../api/diagnostics', () => ({
  fetchDiagnosticsTemperatures: (query: DiagnosticsTemperatureQuery) => fetchMock(query),
}));

function response(bucketMinutes: number): DiagnosticsTemperaturesResponse {
  return { supported: true, bucketMinutes, retentionDays: 90, series: [], episodes: [] };
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

describe('useDiagnosticsTemperatures', () => {
  it('fetches with an hours query and not a date', async () => {
    fetchMock.mockResolvedValue({ data: response(30), mocked: false });
    // Stable identity: the hook's contract requires a memoized query (an
    // inline literal re-triggers the effect every render, looping forever).
    const query: DiagnosticsTemperatureQuery = { hours: 168 };
    renderHook(() => useDiagnosticsTemperatures(true, query));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith({ hours: 168 });
  });

  it('fetches with a date query and not hours when in day mode', async () => {
    fetchMock.mockResolvedValue({ data: response(5), mocked: false });
    const query: DiagnosticsTemperatureQuery = { date: '2026-07-05' };
    renderHook(() => useDiagnosticsTemperatures(true, query));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith({ date: '2026-07-05' });
  });

  it('refetches when the query changes from hours to a date', async () => {
    fetchMock.mockResolvedValue({ data: response(30), mocked: false });
    const { rerender } = renderHook(
      ({ query }: { query: DiagnosticsTemperatureQuery }) => useDiagnosticsTemperatures(true, query),
      { initialProps: { query: { hours: 168 } as DiagnosticsTemperatureQuery } },
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => rerender({ query: { date: '2026-07-05' } }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith({ date: '2026-07-05' });
  });

  it('discards a stale response that resolves after a newer request (seq guard)', async () => {
    let resolveFirst: ((v: { data: DiagnosticsTemperaturesResponse | null; mocked: boolean }) => void) | null = null;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    fetchMock.mockResolvedValueOnce({ data: response(15), mocked: false });

    const { result, rerender } = renderHook(
      ({ query }: { query: DiagnosticsTemperatureQuery }) => useDiagnosticsTemperatures(true, query),
      { initialProps: { query: { hours: 168 } as DiagnosticsTemperatureQuery } },
    );

    act(() => rerender({ query: { hours: 72 } }));
    await settle();
    expect(result.current.data?.bucketMinutes).toBe(15);

    await act(async () => {
      resolveFirst?.({ data: response(30), mocked: false });
      await Promise.resolve();
    });
    expect(result.current.data?.bucketMinutes).toBe(15);
  });
});
