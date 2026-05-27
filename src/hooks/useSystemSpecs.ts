import { useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';

export interface SystemSpecs {
  pcName: string;
  osBuild: string;
  processor: string;
  motherboard: string;
  memory: string;
  storage: string;
  graphicsCard: string;
  monitor: string;
  soundCard: string;
  networkCard: string;
}

export interface UseSystemSpecs {
  specs: SystemSpecs | null;
}

// Module-scoped session cache so tab switches don't refetch. Specs are
// effectively static at runtime (hostname, motherboard, GPU don't change
// between renders), so painting a loading skeleton every time the user
// revisits the tab is jarring — fetch once per session, never again.
let sessionSpecs: SystemSpecs | null = null;

export function useSystemSpecs(enabled: boolean): UseSystemSpecs {
  const [specs, setSpecs] = useState<SystemSpecs | null>(sessionSpecs);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled && sessionSpecs === null) {
      void (async () => {
        const data = await fetchService<SystemSpecs>('/system/specs');
        if (!mountedRef.current) return;
        if (data) {
          sessionSpecs = data;
          setSpecs(data);
        }
      })();
    }
    return () => { mountedRef.current = false; };
  }, [enabled]);

  return { specs };
}
