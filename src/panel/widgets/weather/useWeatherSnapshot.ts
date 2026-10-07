import { useEffect, useState } from 'react';
import { weatherProblem } from './weatherProblem';
import { fetchWeather, weatherLocationQuery, type WeatherLocation, type WeatherSnapshot } from '../../../api/weather';

export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
// Poll cadence. A reading is reused until WEATHER_REFRESH_MS, but an outage is
// never cached, so it is retried at every tick.
export const WEATHER_RETRY_MS = 60 * 1000;

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
      if (snap && !weatherProblem(snap, true)) cache.set(key, { snap, at: Date.now() });
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
// auto / IP geolocation).
export function useWeatherSnapshot(location: WeatherLocation | null | undefined): WeatherSnapshotState {
  const key = weatherLocationQuery(location);
  const [state, setState] = useState<WeatherSnapshotState>(() => {
    const hit = cache.get(key);
    return hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at } : { snap: null, loaded: false, fetchedAt: 0 };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = cache.get(key);
    // Reset so a switch never shows the previous place's weather; a fresh
    // cache hit renders immediately.
    setState(hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at } : { snap: null, loaded: false, fetchedAt: 0 });

    async function load() {
      const cached = cache.get(key);
      // Ticks land on whole minutes while a reading is stamped when its fetch
      // finished, so a tick sees slightly under a full window; half a tick of
      // tolerance keeps the cadence at one refresh per window.
      if (cached && Date.now() - cached.at < WEATHER_REFRESH_MS - WEATHER_RETRY_MS / 2) {
        // Another mount on this key fetched it; adopt the newer reading.
        setState(prev => (cached.at > prev.fetchedAt
          ? { snap: cached.snap, loaded: true, fetchedAt: cached.at }
          : prev));
        return;
      }
      const snap = await fetchCached(key, location ?? null);
      if (cancelled) return;
      const entry = cache.get(key);
      const at = entry && entry.snap === snap ? entry.at : Date.now();
      setState(prev => ({ snap: snap ?? prev.snap, loaded: true, fetchedAt: snap ? at : prev.fetchedAt }));
    }
    void load();
    const timer = setInterval(() => { void load(); }, WEATHER_RETRY_MS);
    return () => { cancelled = true; clearInterval(timer); };
    // `location` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
