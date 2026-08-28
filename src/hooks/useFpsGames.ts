import { useEffect, useState } from 'react';
import { fetchFpsGames, type FpsGameSummary } from '../api/fps';

const REFETCH_MS = 60_000;

export interface UseFpsGamesResult {
  /** False on a platform with no capture (see plan's Windows-only decision) -
   *  games stays empty either way, so callers rarely need to branch on this. */
  supported: boolean;
  gamesByKey: ReadonlyMap<string, FpsGameSummary>;
}

/**
 * Per-game FPS summaries for the Steam page, fetched once on mount and
 * refetched every 60s while the tab is visible. Silent on failure or an
 * unsupported platform (fetchFpsGames resolves null; state just doesn't
 * change) - the Steam page renders nothing extra either way.
 */
export function useFpsGames(): UseFpsGamesResult {
  const [supported, setSupported] = useState(true);
  const [gamesByKey, setGamesByKey] = useState<ReadonlyMap<string, FpsGameSummary>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchFpsGames();
      if (cancelled || !res) return;
      setSupported(res.supported);
      setGamesByKey(new Map(res.games.map(g => [g.gameKey, g])));
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFETCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { supported, gamesByKey };
}
