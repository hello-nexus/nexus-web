import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';

export interface SeriesEntry {
  name: string;
  color: string;
  values: number[];
  current: number;
  avg: number;
}

export interface MonitorData {
  cpuSeries: SeriesEntry[];
  memSeries: SeriesEntry[];
  sampleCount: number;
  totalCpu: number;
  totalMemMb: number;
  systemMemMb: number;
}

export function useProcessMonitor(): MonitorData {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getProcessData();
}
