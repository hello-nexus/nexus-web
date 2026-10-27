import { useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';

export interface HardwareIds {
  gpus?: { vendor: string; device: string; subVendor: string; subDevice: string }[] | null;
  ramModules?: { manufacturer: string; partNumber: string; capacityBytes: number; configuredSpeedMts: number }[] | null;
  drives?: { vendor: string; model: string }[] | null;
  board?: { manufacturer: string; product: string } | null;
  monitors?: { manufacturer: string; productCode: string; name: string }[] | null;
}

export interface SystemSpecs {
  pcName: string;
  osBuild: string;
  processor: string;
  motherboard: string;
  memory: string;
  storage: string;
  graphicsCard: string;
  // The card that renders games (first discrete adapter); absent on a service older than it.
  primaryGpu?: string;
  monitor: string;
  soundCard: string;
  networkCard: string;
  // Part identifiers per source; absent on a service older than it, null per source when it has none.
  hardwareIds?: HardwareIds;
}

export interface UseSystemSpecs {
  specs: SystemSpecs | null;
}

// Module-scoped session cache so tab switches don't refetch. Specs are static
// at runtime (hostname, motherboard, GPU), so fetch once per session.
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
