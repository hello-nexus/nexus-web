// Static catalog of devices Nexus knows about (available + planned + experimental).
// Fetched once per modal open, filtered client-side for search/pagination.
import { useEffect, useState } from 'react';
import { fetchService } from '../api/service';

export interface SupportedDevice {
  vendor: string;
  model: string;
  category: string;
  vendorId: string;
  productId: string;
  capabilities: string[];
  source: 'nexus' | 'openrgb';
}

interface SupportedResponse {
  items: SupportedDevice[];
}

export type SupportedSource = 'peripherals' | 'all';

const SOURCE_PATHS: Record<SupportedSource, string> = {
  peripherals: '/peripherals/supported',
  all: '/peripherals/all-supported',
};

export function useSupportedDevices(enabled: boolean, source: SupportedSource = 'peripherals') {
  const [devices, setDevices] = useState<SupportedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
     
    setLoading(true);
    fetchService<SupportedResponse>(SOURCE_PATHS[source]).then(data => {
      if (cancelled) return;
      setDevices((data?.items as SupportedDevice[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, source]);

  return { devices, loading };
}
