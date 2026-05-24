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
}

interface SupportedResponse {
  items: SupportedDevice[];
}

export type SupportedSource = 'peripherals' | 'lighting';

export function useSupportedDevices(enabled: boolean, source: SupportedSource = 'peripherals') {
  const [devices, setDevices] = useState<SupportedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const path = source === 'lighting' ? '/peripherals/lighting-supported' : '/peripherals/supported';
    fetchService<SupportedResponse>(path).then(data => {
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
