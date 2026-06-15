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

export interface GpuProcess { name: string; gpuPercent: number; dedicatedMb: number; adapterLuid: string; }

export interface GpuProcessData {
  utilSeries: SeriesEntry[];
  memSeries: SeriesEntry[];
  procSeries: SeriesEntry[];
  ranked: GpuProcess[];
}

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
 * Subscribes to the gpu-processes topic and ingests each frame into the store.
 * Mounted at monitoring-page level (not per-tab) so the PDH backend collector
 * stays warm and per-process history accrues across tab switches. Exactly one
 * feed may be mounted: a second concurrent subscriber double-ingests and halves
 * the 60s history window. Ingest-only (no re-render) - read via useGpuProcessData.
 */
export function useGpuProcessFeed(enabled: boolean): void {
  useTopicCallback('gpu-processes', enabled, (data) => {
    store.ingestGpuProcesses((data as { processes?: GpuProcess[] }).processes ?? []);
  });
}

/**
 * Reads the accumulated per-process GPU series (GPU% + VRAM over time) and the
 * current ranked snapshot, re-rendering on each ingested frame. Requires a
 * mounted useGpuProcessFeed to supply the data. `luid` scopes to one physical
 * GPU (the picked adapter); "" shows every adapter combined.
 */
export function useGpuProcessData(luid = ''): GpuProcessData {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getGpuProcessData(luid);
}
