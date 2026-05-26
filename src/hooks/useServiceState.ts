import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import type { PanelStatus } from '../api/panel';
import type { MultiplexContextValue } from './useMultiplexSocket';

interface CoolingStatus {
  calibrating: boolean;
  calibrationState: 'idle' | 'running' | 'complete';
  activeCurves: number;
  fanCount: number;
  /** Fans in user-set bias mode. */
  manualFans: number;
  /** Fans currently being driven by a curve. Drives the sidebar status dot. */
  activeCurveFanCount: number;
}

interface LightingStatus {
  effect: string;
  /** True when an effect is running on the engine (effectName !== "none"). */
  running: boolean;
  /** True when the bundled openrgb-headless subprocess is up. Distinct from
   *  `running`; consumers like the "OpenRGB running" badge and the rescan
   *  button gate on this, not on effect-engine state. */
  rgbRunning: boolean;
  scanning: boolean;
}

export interface ServiceState {
  cooling: CoolingStatus | null;
  lighting: LightingStatus | null;
  panel: PanelStatus | null;
}

// Push-driven: cooling, lighting, and panel/device topics each fire when their
// state changes. We refetch the canonical status endpoint on receipt instead
// of polling 2x/sec. Fallback poll only kicks in when the multiplex socket is
// down; conditional polls cover the two completion paths the server doesn't
// broadcast (lighting rescan + cooling calibration).
const FALLBACK_POLL_MS = 5000;
const COMPLETION_POLL_MS = 1000;

export function useServiceState(
  enabled: boolean,
  multiplex: MultiplexContextValue | null,
): ServiceState {
  const [state, setState] = useState<ServiceState>({ cooling: null, lighting: null, panel: null });
  const mounted = useRef(true);

  const subscribe = multiplex?.subscribe;
  const unsubscribe = multiplex?.unsubscribe;
  const connected = multiplex?.connected ?? false;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refetchCooling = useCallback(async () => {
    const v = await fetchService<CoolingStatus>('/cooling/status');
    if (mounted.current) setState(s => ({ ...s, cooling: v ?? null }));
  }, []);
  const refetchLighting = useCallback(async () => {
    const v = await fetchService<LightingStatus>('/lighting/status');
    if (mounted.current) setState(s => ({ ...s, lighting: v ?? null }));
  }, []);
  const refetchPanel = useCallback(async () => {
    const v = await fetchService<PanelStatus>('/panel/status');
    if (mounted.current) setState(s => ({ ...s, panel: v ?? null }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reset cached external-service state when the consumer disables the
      // hook (e.g. service goes offline). Canonical "subscribe / unsubscribe"
      // teardown - the value is derived from the external system going away.
       
      setState({ cooling: null, lighting: null, panel: null });
      return;
    }

    void refetchCooling();
    void refetchLighting();
    void refetchPanel();

    if (!subscribe || !unsubscribe) return;

    const onCooling = () => { void refetchCooling(); };
    const onLighting = () => { void refetchLighting(); };
    const onPanelDevice = () => { void refetchPanel(); };

    subscribe('cooling', onCooling);
    subscribe('lighting', onLighting);
    subscribe('panel/device', onPanelDevice);

    return () => {
      unsubscribe('cooling', onCooling);
      unsubscribe('lighting', onLighting);
      unsubscribe('panel/device', onPanelDevice);
    };
  }, [enabled, subscribe, unsubscribe, refetchCooling, refetchLighting, refetchPanel]);

  // Slow polling while the WS is down so the sidebar pips don't freeze.
  useEffect(() => {
    if (!enabled || connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await Promise.all([refetchCooling(), refetchLighting(), refetchPanel()]);
      if (cancelled) return;
      timer = setTimeout(tick, FALLBACK_POLL_MS);
    };
    timer = setTimeout(tick, FALLBACK_POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, connected, refetchCooling, refetchLighting, refetchPanel]);

  // Rescan completion and calibration completion are server-side state
  // transitions that don't go through a /lighting or /cooling mutation, so the
  // topic never fires for the flip-to-false. Poll the relevant endpoint while
  // the flag is true; clears the moment it drops.
  const scanning = state.lighting?.scanning ?? false;
  useEffect(() => {
    if (!enabled || !scanning) return;
    const id = setInterval(refetchLighting, COMPLETION_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, scanning, refetchLighting]);

  const calibrating = state.cooling?.calibrating ?? false;
  useEffect(() => {
    if (!enabled || !calibrating) return;
    const id = setInterval(refetchCooling, COMPLETION_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, calibrating, refetchCooling]);

  // Catch up state that may have changed during a WS outage.
  const prevConnected = useRef(connected);
  useEffect(() => {
    if (enabled && !prevConnected.current && connected) {
      // Reconnect catch-up: refetch the canonical status endpoints. setState
      // happens asynchronously after the HTTP fetches resolve, not within
      // this effect body. Canonical external-system synchronisation.
       
      void refetchCooling();
      void refetchLighting();
      void refetchPanel();
    }
    prevConnected.current = connected;
  }, [enabled, connected, refetchCooling, refetchLighting, refetchPanel]);

  return state;
}
