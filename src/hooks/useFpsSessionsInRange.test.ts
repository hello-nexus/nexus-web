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
    expect(result.current.sessions).toEqual([{ ...session(), inProgress: false }]);
  });

  it('debounces a domain change instead of fetching on every render', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchMock.mockClear();

    rerender({ domain: [0, 20_000] });
    rerender({ domain: [0, 21_000] });
    rerender({ domain: [0, 22_000] });
    await advance(50);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch while the domain stays inside the covered window plus slack', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 60_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    for (let i = 1; i <= 4; i++) rerender({ domain: [i * 1000, 60_000 + i * 1000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ domain: [0, 60_000 + 16_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(0, 76_000);
  });

  it('refetches when the domain widens earlier than the covered window', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [10_000, 60_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchMock.mockClear();
    rerender({ domain: [0, 60_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(0, 60_000);
  });

  it('forgets coverage while disabled and refetches an unchanged domain on enable', async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFpsSessionsInRange([0, 60_000], enabled),
      { initialProps: { enabled: true } },
    );
    await advance(DEBOUNCE_MS);
    fetchMock.mockClear();
    rerender({ enabled: false });
    rerender({ enabled: true });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a superseded response establish coverage', async () => {
    let resolveFirst: ((r: FpsSessionsInRangeResponse) => void) | null = null;
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }));
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 60_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ domain: [100_000, 160_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { resolveFirst?.({ sessions: [] }); });
    await flush();

    rerender({ domain: [0, 60_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('treats an in-flight window as covered so slow responses still collapse tick refetches', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 60_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= 3; i++) rerender({ domain: [i * 1000, 60_000 + i * 1000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed fetch as coverage', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useFpsSessionsInRange(domain, true),
      { initialProps: { domain: [0, 60_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ domain: [1000, 61_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flags a session that was still running at fetch time as in progress', async () => {
    const now = Date.now();
    fetchMock.mockResolvedValue({ sessions: [session({ id: 'live', endedUtcMs: now - 1000 }), session({ id: 'old', endedUtcMs: now - 60_000 })] });
    const { result } = renderHook(() => useFpsSessionsInRange([now - 120_000, now], true));
    await advance(DEBOUNCE_MS);
    expect(result.current.sessions.map(s => [s.id, s.inProgress])).toEqual([['live', true], ['old', false]]);
  });

  it('keeps the same sessions array when a quiet refresh returns unchanged data', async () => {
    fetchMock.mockResolvedValue({ sessions: [session()] });
    const { result } = renderHook(() => useFpsSessionsInRange([0, 60_000], true));
    await advance(DEBOUNCE_MS);
    const first = result.current.sessions;
    expect(first).toHaveLength(1);

    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.sessions).toBe(first);

    fetchMock.mockResolvedValue({ sessions: [session({ endedUtcMs: 9000 })] });
    await advance(5000);
    expect(result.current.sessions).not.toBe(first);
    expect(result.current.sessions[0].endedUtcMs).toBe(9000);
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
