import { useEffect, useState } from 'react';

// Dev-tools-only: a simulated Tryx Panorama so the device page + overlay editor
// can be exercised with no hardware attached. The flag drives both the device
// injection (useUnifiedDevices) and the mock data path in api/tryx.ts.
const KEY = 'nexus_tryx_simulated';
export const TRYX_SIMULATION_CHANGED_EVENT = 'tryx-simulate-changed';

/** Off in production builds regardless of the stored flag. */
export function isTryxSimulated(): boolean {
  if (!__DEV_TOOLS__) return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setTryxSimulated(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
  window.dispatchEvent(new Event(TRYX_SIMULATION_CHANGED_EVENT));
}

export function useTryxSimulated(): boolean {
  const [on, setOn] = useState(isTryxSimulated);
  useEffect(() => {
    const sync = () => setOn(isTryxSimulated());
    window.addEventListener(TRYX_SIMULATION_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TRYX_SIMULATION_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return on;
}
