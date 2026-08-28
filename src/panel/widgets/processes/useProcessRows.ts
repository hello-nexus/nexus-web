import { useEffect, useRef, useState } from 'react';
import * as store from '../../../lib/monitoringStore';
import { useGpuProcessFeed } from '../../../hooks/useProcessMonitor';
import type { ProcessRow } from './processesData';

/**
 * Live process rows, refreshed every `refreshFrames` monitoring frames. Reads
 * the store the monitoring bridge already feeds (PanelEntrypoint / Dashboard)
 * rather than opening a subscription of its own; `gpuEnabled` gates the
 * per-process GPU feed.
 *
 * Counting frames rather than elapsed time is deliberate: against a ~1 Hz
 * source a wall-clock window drops any frame that arrives early, so the next
 * accepted one lands two frames later and the cadence alternates 1 s / 2 s.
 */
export function useProcessRows(refreshFrames: number, gpuEnabled: boolean): ProcessRow[] {
  useGpuProcessFeed(gpuEnabled);

  const [rows, setRows] = useState<ProcessRow[]>([]);
  // Read through refs so changing either value does not re-register the
  // subscription.
  const refreshRef = useRef(refreshFrames);
  const gpuRef = useRef(gpuEnabled);
  refreshRef.current = refreshFrames;
  gpuRef.current = gpuEnabled;

  useEffect(() => {
    let lastTick = -Infinity;
    const onFrame = () => {
      // store.subscribe also fires for screentime and gpu-processes ingests;
      // only a monitoring frame bumps frameTick, so counting it both paces the
      // refresh and keeps those other sources from claiming the window.
      const tick = store.getFrameTick();
      if (tick - lastTick < refreshRef.current) return;
      lastTick = tick;
      setRows(buildRows(gpuRef.current));
    };
    // The store survives across mounts, so seed from what it already holds.
    onFrame();
    store.subscribe(onFrame);
    return () => store.unsubscribe(onFrame);
  }, []);

  // The platform ping resolves after mount; without this the GPU column would
  // read 0.0% for every row until the next accepted frame.
  useEffect(() => {
    setRows(buildRows(gpuEnabled));
  }, [gpuEnabled]);

  return rows;
}

function buildRows(gpuEnabled: boolean): ProcessRow[] {
  const gpu = gpuEnabled ? store.getGpuPercentByName() : null;
  return store.getAllProcessValues().map(p => ({
    name: p.name,
    cpu: p.cpu,
    memMb: p.memMb,
    io: p.io,
    // undefined where the platform has no per-process GPU source at all, so a
    // missing source is distinguishable from a genuine 0.
    gpu: gpu ? gpu.get(p.name) ?? 0 : undefined,
  }));
}
