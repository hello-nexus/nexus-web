import type { GameSyncGame } from '../../../../api/lighting';

// Host-scoped: two machines' panels opened from one browser must not read
// each other's list.
const STORAGE_KEY = `nexus_gamesync_supported_games_v1:${location.host}`;

/**
 * Last scan's supported-game list. The scanner publishes only when a scan
 * ends, so this covers the gap after a service restart; the next completed
 * scan overwrites it, empty result included.
 */
type CachedGame = Pick<GameSyncGame, 'name' | 'store' | 'appId' | 'emitsChroma' | 'emitsGsi'>;

function isCachedGame(value: unknown): value is CachedGame {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g.name === 'string'
    && typeof g.store === 'string'
    && typeof g.appId === 'string'
    && typeof g.emitsChroma === 'boolean'
    && typeof g.emitsGsi === 'boolean';
}

/** Empty when absent, blocked, or malformed - a bad entry drops the whole cache. */
export function readCachedGames(): GameSyncGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isCachedGame)) return [];
    // Rebuilt field by field, never spread: an older blob must not smuggle
    // keys through. The scan counters are diagnostics no row reads.
    return parsed.map(({ name, store, appId, emitsChroma, emitsGsi }) => ({
      name, store, appId, emitsChroma, emitsGsi, scannedFiles: 0, skippedFiles: 0,
    }));
  } catch {
    return [];
  }
}

/** Replaces the cache with `games`. Silent on failure - a full or blocked store must not break the pane. */
export function writeCachedGames(games: readonly GameSyncGame[]): void {
  try {
    const trimmed: CachedGame[] = games.map(({ name, store, appId, emitsChroma, emitsGsi }) => ({
      name, store, appId, emitsChroma, emitsGsi,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // no-op
  }
}
