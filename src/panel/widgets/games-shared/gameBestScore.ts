import type { GameType } from '../../../types/games';

const STORAGE_PREFIX = 'nexus_panel_game_best_';

/** Best local score ever recorded for one wire game type. 0 when unset. */
export function getBestScore(gameType: GameType): number {
  const raw = localStorage.getItem(STORAGE_PREFIX + gameType);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Persists `score` as the new best if it beats the stored one. Returns the resulting best. */
export function recordBestScore(gameType: GameType, score: number): number {
  const current = getBestScore(gameType);
  if (score > current) {
    localStorage.setItem(STORAGE_PREFIX + gameType, String(score));
    return score;
  }
  return current;
}

/** Highest local best across several game types, for a tile that shares one "Best" figure across difficulties. */
export function getBestScoreAcross(gameTypes: readonly GameType[]): number {
  return Math.max(0, ...gameTypes.map(getBestScore));
}
