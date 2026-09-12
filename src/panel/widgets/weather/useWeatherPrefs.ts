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
  loaded: boolean;
}

const EMPTY: StoreState = { prefs: { unit: 'auto', locations: [] }, loaded: false };

let state: StoreState = EMPTY;
let loading: Promise<void> | null = null;
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

function load(): Promise<void> {
  if (loading) return loading;
  loading = fetchWeatherPrefs()
    .then(prefs => { setState({ prefs: prefs ? normalize(prefs) : state.prefs, loaded: true }); })
    .catch(() => { setState({ ...state, loaded: true }); })
    .finally(() => { loading = null; });
  return loading;
}

async function commit(patch: Partial<WeatherPrefs>) {
  // Optimistic: the list updates before the round trip; the echo replaces it
  // (the service trims, dedupes and caps).
  setState({ ...state, prefs: { ...state.prefs, ...patch } });
  const echoed = await saveWeatherPrefs(patch).catch(() => null);
  if (echoed) setState({ ...state, prefs: normalize(echoed) });
}

// Test seam: drop the cached prefs so the next subscriber reloads.
export function resetWeatherPrefsStore() {
  state = EMPTY;
  loading = null;
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
    if (state.prefs.locations.some(l => sameWeatherLocation(l, location))) return;
    void commit({ locations: [...state.prefs.locations, location] });
  }, []);

  const removeLocation = useCallback((location: WeatherLocation) => {
    void commit({ locations: state.prefs.locations.filter(l => !sameWeatherLocation(l, location)) });
  }, []);

  const setUnit = useCallback((unit: WeatherUnitPref) => {
    void commit({ unit });
  }, []);

  return { prefs, loaded, addLocation, removeLocation, setUnit };
}
