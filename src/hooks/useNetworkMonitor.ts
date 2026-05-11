import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';
import type { SeriesEntry } from './useProcessMonitor';

export interface NetworkEntry {
  name: string;
  color: string;
  rateIn: number;
  rateOut: number;
  rateTotal: number;
}

export interface NetworkData {
  series: SeriesEntry[];
  sampleCount: number;
  totalRate: number;
  totalRateIn: number;
  totalRateOut: number;
  entries: NetworkEntry[];
}

export function useNetworkMonitor(enabled = true): NetworkData {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, [enabled]);
  return store.getNetworkData();
}
