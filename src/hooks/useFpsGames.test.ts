import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFpsGames } from './useFpsGames';
import type { FpsGamesResponse } from '../api/fps';

const fetchMock = vi.fn<() => Promise<FpsGamesResponse | null>>();
vi.mock('../api/fps', () => ({
  fetchFpsGames: () => fetchMock(),
}));

function game(overrides: Partial<FpsGamesResponse['games'][number]> = {}) {
  return {
    gameKey: 'steam:730', name: 'Counter-Strike 2', store: 'steam', steamAppId: 730,
    sessions: 4, focusedSec: 3600, avgFps: 144, p1Fps: 90, p99Fps: 200, minFps: 60, maxFps: 240,
    lastPlayedUtcMs: 1_700_000_000_000,
    ...overrides,
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
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
  fetchMock.mockResolvedValue({ supported: true, games: [] });
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useFpsGames', () => {
  it('fetches once on mount and keys the result by gameKey', async () => {
    fetchMock.mockResolvedValue({ supported: true, games: [game()] });
    const { result } = renderHook(() => useFpsGames());
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.supported).toBe(true);
    expect(result.current.gamesByKey.get('steam:730')?.avgFps).toBe(144);
  });

  it('refetches every 60s while the document is visible', async () => {
    renderHook(() => useFpsGames());
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips the tick while the document is hidden', async () => {
    renderHook(() => useFpsGames());
    await advance(0);
    fetchMock.mockClear();
    setVisibility('hidden');

    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays empty and does not throw when the request fails', async () => {
    fetchMock.mockResolvedValue(null);
    const { result } = renderHook(() => useFpsGames());
    await advance(0);

    expect(result.current.gamesByKey.size).toBe(0);
  });

  it('refetches on demand via refetch(), picking up a game deleted server-side', async () => {
    fetchMock.mockResolvedValue({ supported: true, games: [game()] });
    const { result } = renderHook(() => useFpsGames());
    await advance(0);
    expect(result.current.gamesByKey.size).toBe(1);

    fetchMock.mockResolvedValue({ supported: true, games: [] });
    act(() => { result.current.refetch(); });
    await flush();

    expect(result.current.gamesByKey.size).toBe(0);
  });
});
