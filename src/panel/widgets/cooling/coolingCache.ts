/**
 * Stale-while-revalidate cache for CoolingPage's initial render.
 *
 * On the first ever visit we have nothing — the page renders an empty
 * fan list while the network round-trips finish. On every visit AFTER,
 * the last-good snapshot is replayed synchronously from localStorage so
 * the page paints cards immediately, then the live fetch updates them
 * in place (any diff just re-renders the affected cards instead of
 * blank-then-filled pop-in).
 *
 * What's cached: the four primary fetches the page mounts with — fans,
 * curves, sources, active preset — plus the derived per-fan state map
 * the wire layer needs to draw connections at first paint. Realtime
 * frame data, drag state, hover state, modal open state, etc. are
 * intentionally NOT cached (they're either too fast-moving to be useful
 * or strictly UI ephemera).
 *
 * Shape evolution: bump the version suffix on the storage key whenever
 * the cached fields change shape so old payloads aren't deserialised
 * into garbage state.
 */
import type { FanChannel, TemperatureSource } from '../../../api/cooling';
import type { CurveDef, FanState } from '../../../types/cooling';
import type { CoolingPresetKey } from './page/coolingPresets';
import type { FanCardHubMode } from './page/FanCard';

const STORAGE_KEY = 'nexus_cooling_cache_v1';

export interface CoolingCache {
  channels: FanChannel[];
  curves: CurveDef[];
  sources: TemperatureSource[];
  fanStates: Record<string, FanState>;
  activePreset: CoolingPresetKey | null;
  hubModes: Record<string, FanCardHubMode>;
}

const EMPTY: CoolingCache = {
  channels: [],
  curves: [],
  sources: [],
  fanStates: {},
  activePreset: null,
  hubModes: {},
};

/**
 * Synchronous read. Returns the last-good snapshot or `EMPTY` when no
 * cache exists / the cached payload is unreadable. Safe to call in a
 * useState initializer.
 */
export function loadCoolingCache(): CoolingCache {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CoolingCache>;
    return {
      channels:     Array.isArray(parsed.channels)     ? parsed.channels     : [],
      curves:       Array.isArray(parsed.curves)       ? parsed.curves       : [],
      sources:      Array.isArray(parsed.sources)      ? parsed.sources      : [],
      fanStates:    isPlainObject(parsed.fanStates)    ? parsed.fanStates    : {},
      activePreset: typeof parsed.activePreset === 'string'
        ? parsed.activePreset as CoolingPresetKey
        : null,
      hubModes:     isPlainObject(parsed.hubModes)     ? parsed.hubModes     : {},
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Fire-and-forget write. Quota errors etc. are swallowed — caching is
 * a UX nicety, never load-bearing for correctness.
 */
export function saveCoolingCache(cache: CoolingCache): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* swallow */
  }
}

/**
 * Patch just the active-preset slice without touching the rest of the
 * cached state. Used by the cooling widget when the user picks a new
 * preset there: the page may not be mounted yet, so its useState
 * initializer needs to find the freshly-set preset when it mounts next.
 * Idempotent — a no-op write when the preset hasn't actually changed.
 */
export function setCachedCoolingActivePreset(preset: CoolingPresetKey): void {
  const current = loadCoolingCache();
  if (current.activePreset === preset) return;
  saveCoolingCache({ ...current, activePreset: preset });
}

function isPlainObject<T>(v: unknown): v is Record<string, T> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
