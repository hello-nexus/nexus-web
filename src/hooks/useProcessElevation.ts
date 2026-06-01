import { useCallback, useEffect, useState } from 'react';
import {
  fetchProcessElevation,
  requestProcessElevationRelaunch,
  type ProcessElevationRelaunchResult,
  type ProcessElevationResponse,
} from '../api/system';

export type ProcessElevationHookState =
  | { state: 'checking'; elevation: null; relaunch: () => Promise<ProcessElevationRelaunchResult | null> }
  | { state: 'ready'; elevation: ProcessElevationResponse; relaunch: () => Promise<ProcessElevationRelaunchResult | null> }
  | { state: 'unavailable'; elevation: null; relaunch: () => Promise<ProcessElevationRelaunchResult | null> };

// Re-poll cadence for elevation. The value rarely changes; this catches the
// transition shortly after the user accepts the UAC prompt and the elevated
// child binds the port.
const POLL_INTERVAL_MS = 5_000;

export function useProcessElevation(serviceOnline: boolean): ProcessElevationHookState {
  const relaunch = useCallback(async () => {
    const response = await requestProcessElevationRelaunch();
    return response?.result ?? null;
  }, []);

  const [stateBase, setStateBase] = useState<
    | { state: 'checking'; elevation: null }
    | { state: 'ready'; elevation: ProcessElevationResponse }
    | { state: 'unavailable'; elevation: null }
  >({
    state: serviceOnline ? 'checking' : 'unavailable',
    elevation: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!serviceOnline) {
      // Reset to the unavailable shape so a later reconnect transitions
      // through 'checking' again.
      setStateBase({ state: 'unavailable', elevation: null });
      return () => { cancelled = true; };
    }

    const refresh = async () => {
      const result = await fetchProcessElevation();
      if (cancelled) return;
      setStateBase(result
        ? { state: 'ready', elevation: result }
        : { state: 'unavailable', elevation: null });
    };

    setStateBase({ state: 'checking', elevation: null });
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serviceOnline]);

  return { ...stateBase, relaunch } as ProcessElevationHookState;
}
