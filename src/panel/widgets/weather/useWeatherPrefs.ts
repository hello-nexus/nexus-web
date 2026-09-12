// Module-level store for the workstation weather prefs so the widget edit
// sheet, the page and the immersive view read one list and see each other's
// adds/removes in the same session. Loaded from the service on first
// subscribe; every mutation writes through and adopts the service's echo.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  fetchWeatherPrefs,
  sameWeatherLocation,
  saveWeatherPrefs,
  type WeatherLocation,
  type WeatherPrefs,
  type WeatherUnitPref,
} from '../../../api/weather';

interface StoreState {
  prefs: WeatherPrefs;
  // True once a GET has succeeded; a mutation before that would PUT the empty
  // default over the workstation's real list.
  loaded: boolean;
}

const EMPTY: StoreState = { prefs: { unit: 'auto', locations: [] }, loaded: false };

let state: StoreState = EMPTY;
let loading: Promise<boolean> | null = null;
// Echoes can land out of order; only the latest commit's echo is adopted.
let commitSeq = 0;
const listeners = new Set<() => void>();

function setState(next: StoreState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return state;
}

function normalize(prefs: WeatherPrefs): WeatherPrefs {
  const unit: WeatherUnitPref = prefs.unit === 'C' || prefs.unit === 'F' ? prefs.unit : 'auto';
  return { unit, locations: Array.isArray(prefs.locations) ? prefs.locations : [] };
}

function load(): Promise<boolean> {
  if (loading) return loading;
  loading = fetchWeatherPrefs()
    .then(prefs => {
      if (!prefs) return false;
      setState({ prefs: normalize(prefs), loaded: true });
      return true;
    })
    .catch(() => false)
    .finally(() => { loading = null; });
  return loading;
}

// Builds the patch against the loaded prefs (re-fetching first when the
// initial GET failed), then writes optimistically and adopts the echo (the
// service trims, dedupes and caps). A commit that cannot see the real list
// is dropped rather than risk replacing it.
async function commit(build: (prefs: WeatherPrefs) => Partial<WeatherPrefs> | null) {
  if (!state.loaded && !(await load())) return;
  const patch = build(state.prefs);
  if (!patch) return;
  const seq = ++commitSeq;
  setState({ ...state, prefs: { ...state.prefs, ...patch } });
  const echoed = await saveWeatherPrefs(patch).catch(() => null);
  if (echoed && seq === commitSeq) setState({ ...state, prefs: normalize(echoed) });
}

// Test seam: drop the cached prefs so the next subscriber reloads.
export function resetWeatherPrefsStore() {
  state = EMPTY;
  loading = null;
  commitSeq = 0;
}

export interface WeatherPrefsController {
  prefs: WeatherPrefs;
  loaded: boolean;
  addLocation: (location: WeatherLocation) => void;
  removeLocation: (location: WeatherLocation) => void;
  setUnit: (unit: WeatherUnitPref) => void;
}

export function useWeatherPrefs(): WeatherPrefsController {
  const { prefs, loaded } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!state.loaded) void load();
  }, []);

  const addLocation = useCallback((location: WeatherLocation) => {
    void commit(prefs => prefs.locations.some(l => sameWeatherLocation(l, location))
      ? null
      : { locations: [...prefs.locations, location] });
  }, []);

  const removeLocation = useCallback((location: WeatherLocation) => {
    void commit(prefs => ({ locations: prefs.locations.filter(l => !sameWeatherLocation(l, location)) }));
  }, []);

  const setUnit = useCallback((unit: WeatherUnitPref) => {
    void commit(() => ({ unit }));
  }, []);

  return { prefs, loaded, addLocation, removeLocation, setUnit };
}
