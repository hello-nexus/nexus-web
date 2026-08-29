import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFpsSessionsInRange } from './useFpsSessionsInRange';
import type { FpsSessionsInRangeResponse } from '../api/fps';

const DEBOUNCE_MS = 300;

const fetchMock = vi.fn<(from: number, to: number) => Promise<FpsSessionsInRangeResponse | null>>();
vi.mock('../api/fps', () => ({
  fetchFpsSessionsInRange: (from: number, to: number) => fetchMock(from, to),
}));

function session(overrides: Partial<FpsSessionsInRangeResponse['sessions'][number]> = {}) {
  return {
    id: 's1', gameKey: 'steam:730', name: 'Counter-Strike 2', store: 'steam',
    startedUtcMs: 1000, endedUtcMs: 5000, avgFps: 132,
    ...overrides,
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
  fetchMock.mockResolvedValue({ sessions: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useFpsSessionsInRange', () => {
  it('does not fetch at all while disabled, and returns an empty array', async () => {
    const { result } = renderHook(() => useFpsSessionsInRange([0, 1000], false));
    await advance(DEBOUNCE_MS);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.sessions).toEqual([]);
  });

  it('fetches sessions overlapping the given domain once enabled', async () => {
    fetchMock.mockResolvedValue({ sessions: [session()] });

    const { result } = renderHook(() => useFpsSessionsInRange([0, 5000], true));
    await advance(DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledWith(0, 5000);
    expect(result.current.sessions).toEqual([session()]);
  });

  it('debounces a domain change instead of fetching on every render', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchMock.mockClear();

    rerender({ domain: [0, 1100] });
    rerender({ domain: [0, 1200] });
    rerender({ domain: [0, 1300] });
    await advance(50);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears sessions immediately when disabled, even with a fetch in flight', async () => {
    let resolveFetch: (v: FpsSessionsInRangeResponse) => void = () => {};
    fetchMock.mockReturnValue(new Promise(res => { resolveFetch = res; }));

    const { result, rerender } = renderHook(
      ({ enabled }) => useFpsSessionsInRange([0, 5000], enabled),
      { initialProps: { enabled: true } },
    );
    await advance(DEBOUNCE_MS);

    rerender({ enabled: false });
    resolveFetch({ sessions: [session()] });
    await flush();

    expect(result.current.sessions).toEqual([]);
  });

  it('resolves an empty array when the request fails', async () => {
    fetchMock.mockResolvedValue(null);
    const { result } = renderHook(() => useFpsSessionsInRange([0, 1000], true));
    await advance(DEBOUNCE_MS);

    expect(result.current.sessions).toEqual([]);
  });
});
