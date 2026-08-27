import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';
import { useTopicCallback } from './useMultiplexSocket';

export interface SeriesEntry {
  name: string;
  color: string;
  values: number[];
  current: number;
  avg: number;
  /** Process creation time, UTC epoch ms; undefined when unavailable or the
   *  source (network/GPU feeds) carries no launch-time attribution. */
  startedAtMs?: number;
  /** Foreground/windowed app vs background process; undefined when the
   *  source carries no such attribution (network/GPU feeds, or a service
   *  that doesn't report it yet). */
  isApp?: boolean;
  publisher?: string | null;
  signed?: 'signed' | 'unsigned' | 'unknown';
}

export interface GpuProcess { name: string; gpuPercent: number; dedicatedMb: number; adapterLuid: string; }

export interface GpuProcessData {
  procSeries: SeriesEntry[];
  procMemSeries: SeriesEntry[];
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
 * Uncapped counterpart to useProcessMonitor's own top-N + Other shape: every
 * currently-running process, sourced from the same live monitoring frame -
 * feeds the monitoring page's complete process list (item 48) rather than a
 * small top-N tile.
 */
export function useAllProcesses(): { cpuSeries: SeriesEntry[]; memSeries: SeriesEntry[] } {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getAllCpuMemSeries();
}

let lastIngestedGpuFrame: unknown = null;

/**
 * Subscribes to the gpu-processes topic and ingests each frame into the store.
 * Mounted at monitoring-page level (not per-tab) so the PDH backend collector
 * stays warm and per-process history accrues across tab switches. Safe to mount
 * from more than one place at once (page + process-list widget): the socket
 * hands every listener of a topic the same parsed frame object, so a repeat
 * sighting is a second subscriber, not a second frame. Guarding on identity
 * rather than refcounting keeps every consumer subscribed, so the feed survives
 * whichever unmounts first. Ingest-only - read via useGpuProcessData.
 */
export function useGpuProcessFeed(enabled: boolean): void {
  useTopicCallback('gpu-processes', enabled, (data) => {
    if (data === lastIngestedGpuFrame) return;
    lastIngestedGpuFrame = data;
    store.ingestGpuProcesses((data as { processes?: GpuProcess[] }).processes ?? []);
  });
}

/**
 * Reads the accumulated per-process GPU series (GPU% + VRAM over time, each
 * carrying current + 60s-avg), re-rendering on each ingested frame. Requires a
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
