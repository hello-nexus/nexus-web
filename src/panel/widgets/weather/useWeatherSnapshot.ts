import { useEffect, useState } from 'react';
import { fetchWeather, weatherLocationQuery, type WeatherLocation, type WeatherSnapshot } from '../../../api/weather';

export const WEATHER_REFRESH_MS = 15 * 60 * 1000;

interface CacheEntry {
  snap: WeatherSnapshot;
  at: number;
}

// Per-location snapshot cache shared by every mount (the page's location
// rail renders one row per saved place while the detail pane shows one of
// them), so switching places re-fetches only what is stale.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WeatherSnapshot | null>>();

function fetchCached(key: string, location: WeatherLocation | null): Promise<WeatherSnapshot | null> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = fetchWeather(location)
    .then(snap => {
      if (snap) cache.set(key, { snap, at: Date.now() });
      return snap;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// Test seam.
export function resetWeatherSnapshotCache() {
  cache.clear();
  inflight.clear();
}

export interface WeatherSnapshotState {
  snap: WeatherSnapshot | null;
  // False until the first fetch for this location has settled (success or not).
  loaded: boolean;
  // Wall clock of the fetch the snapshot came from; 0 before the first load.
  fetchedAt: number;
}

// Loads and periodically refreshes the snapshot for one location (null =
// auto / IP geolocation). `enabled=false` skips every fetch (catalog preview).
export function useWeatherSnapshot(location: WeatherLocation | null | undefined, enabled = true): WeatherSnapshotState {
  const key = weatherLocationQuery(location);
  const [state, setState] = useState<WeatherSnapshotState>(() => {
    const hit = cache.get(key);
    return hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at } : { snap: null, loaded: false, fetchedAt: 0 };
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const hit = cache.get(key);
    // Reset so a switch never shows the previous place's weather; a fresh
    // cache hit renders immediately.
    setState(hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at } : { snap: null, loaded: false, fetchedAt: 0 });

    async function load(force: boolean) {
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < WEATHER_REFRESH_MS) return;
      const snap = await fetchCached(key, location ?? null);
      if (cancelled) return;
      setState(prev => ({ snap: snap ?? prev.snap, loaded: true, fetchedAt: snap ? Date.now() : prev.fetchedAt }));
    }
    void load(false);
    const timer = setInterval(() => { void load(true); }, WEATHER_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
    // `location` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}
