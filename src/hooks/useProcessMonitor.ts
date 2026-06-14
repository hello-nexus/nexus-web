import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';
import { useTopicCallback } from './useMultiplexSocket';

export interface SeriesEntry {
  name: string;
  color: string;
  values: number[];
  current: number;
  avg: number;
}

export interface GpuProcess { name: string; gpuPercent: number; dedicatedMb: number; }

export interface MonitorData {
  cpuSeries: SeriesEntry[];
  memSeries: SeriesEntry[];
  sampleCount: number;
  totalCpu: number;
  totalMemMb: number;
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

/**
 * Per-process GPU history. Subscribing only while the GPU tab is mounted gates
 * the PDH backend collector. Returns top-N series (GPU% over time) for a chart
 * plus the current ranked snapshot (with VRAM).
 */
export function useGpuProcesses(enabled: boolean): { series: SeriesEntry[]; ranked: GpuProcess[] } {
  const [, bump] = useState(0);
  useTopicCallback('gpu-processes', enabled, (data) => {
    store.ingestGpuProcesses((data as { processes?: GpuProcess[] }).processes ?? []);
  });
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getGpuProcessData();
}
