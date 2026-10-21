import { useEffect, useState } from 'react';
import { fetchWeather, weatherLocationQuery, type WeatherErrorReason, type WeatherLocation, type WeatherSnapshot } from '../../../api/weather';

export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
export const WEATHER_RETRY_MS = 30 * 1000;

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
      // A reading the service flagged as failed-to-refresh is not cached, so the next mount retries.
      if (snap?.asOf && !snap.error) cache.set(key, { snap, at: Date.now() });
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
  // Why the latest refresh failed; null when the reading is fresh. With a
  // snapshot that has an asOf it is a stale last-good reading, without one
  // there is no data at all. An empty snapshot from a service that predates
  // the field reads as 'unreachable'.
  error: WeatherErrorReason | null;
}

// Loads and periodically refreshes the snapshot for one location (null =
// auto / IP geolocation).
export function useWeatherSnapshot(location: WeatherLocation | null | undefined): WeatherSnapshotState {
  const key = weatherLocationQuery(location);
  const [state, setState] = useState<WeatherSnapshotState>(() => {
    const hit = cache.get(key);
    return hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at, error: null } : { snap: null, loaded: false, fetchedAt: 0, error: null };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = cache.get(key);
    // Reset so a switch never shows the previous place's weather; a fresh
    // cache hit renders immediately.
    setState(hit ? { snap: hit.snap, loaded: true, fetchedAt: hit.at, error: null } : { snap: null, loaded: false, fetchedAt: 0, error: null });

    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function load(force: boolean) {
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < WEATHER_REFRESH_MS) return;
      const snap = await fetchCached(key, location ?? null);
      if (cancelled) return;
      // An empty asOf is the service's "upstream unreachable" marker, not a
      // reading; a non-empty asOf with an error is a stale last-good reading.
      const reading = snap?.asOf && !snap.error ? snap : null;
      const error: WeatherErrorReason | null = reading ? null : (snap?.error ?? 'unreachable');
      setState(prev => {
        const staleSnap = snap?.asOf ? snap : (prev.snap?.asOf ? prev.snap : null);
        return {
          snap: reading ?? staleSnap ?? snap,
          loaded: true,
          fetchedAt: reading ? Date.now() : (prev.fetchedAt || (staleSnap ? Date.now() : 0)),
          error,
        };
      });
      clearTimeout(retry);
      if (reading) {
        failures = 0;
        return;
      }
      retry = setTimeout(() => { void load(true); }, Math.min(WEATHER_RETRY_MS * 2 ** failures, WEATHER_REFRESH_MS));
      failures += 1;
    }
    void load(false);
    // While retrying, the backoff chain owns refreshes.
    const timer = setInterval(() => { if (failures === 0) void load(true); }, WEATHER_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); clearTimeout(retry); };
    // `location` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
