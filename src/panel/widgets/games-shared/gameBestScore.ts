import type { GameType } from '../../../types/games';

const STORAGE_PREFIX = 'nexus_panel_game_best_';

/**
 * Best local score ever recorded for one wire game type. 0 when unset or when
 * storage access throws (blocked storage, private-mode quirks) - a tile face
 * must never crash its panel cell over a best-score lookup.
 */
export function getBestScore(gameType: GameType): number {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + gameType);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persists `score` as the new best if it beats the stored one. Returns the resulting best. */
export function recordBestScore(gameType: GameType, score: number): number {
  const current = getBestScore(gameType);
  if (score > current) {
    try {
      localStorage.setItem(STORAGE_PREFIX + gameType, String(score));
    } catch {
      return current;
    }
    return score;
  }
  return current;
}

/** Highest local best across several game types, for a tile that shares one "Best" figure across difficulties. */
export function getBestScoreAcross(gameTypes: readonly GameType[]): number {
  return Math.max(0, ...gameTypes.map(getBestScore));
}
