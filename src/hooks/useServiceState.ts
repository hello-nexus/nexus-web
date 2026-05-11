import { useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import type { PanelStatus } from '../api/panel';

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
  running: boolean;
  scanning: boolean;
}

export interface ServiceState {
  cooling: CoolingStatus | null;
  lighting: LightingStatus | null;
  panel: PanelStatus | null;
}

// Sidebar status indicators (cooling dot, lighting dot, scanning spinner) need
// to react within a human reaction time to user changes - not 2 seconds later.
const POLL_MS = 500;

export function useServiceState(enabled: boolean): ServiceState {
  const [state, setState] = useState<ServiceState>({ cooling: null, lighting: null, panel: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setState({ cooling: null, lighting: null, panel: null });
      return () => { mounted.current = false; };
    }

    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const [cooling, lighting, panel] = await Promise.all([
        fetchService<CoolingStatus>('/cooling/status'),
        fetchService<LightingStatus>('/lighting/status'),
        fetchService<PanelStatus>('/panel/status'),
      ]);
      if (!mounted.current) return;
      setState({ cooling: cooling ?? null, lighting: lighting ?? null, panel: panel ?? null });
      timer = setTimeout(tick, POLL_MS);
    };

    tick();

    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [enabled]);

  return state;
}
