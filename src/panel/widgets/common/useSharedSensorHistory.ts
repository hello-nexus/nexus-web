import { useEffect, useState } from 'react';
import { getPanelSensorHist, pushPanelSensorSample, subscribe, unsubscribe } from '../../../lib/monitoringStore';

/**
 * Per-sensor 60-sample history backed by the shared monitoringStore
 * singleton. Same key (e.g. `cpu::CPU Total`) read from any panel cell
 * returns the SAME buffer - so re-mounting a PerfSlot in the immersive
 * view picks up the existing 60 s of samples instead of starting fresh.
 *
 * The hook pushes a new sample whenever `value` changes. Multiple
 * mounts pointing at the same key collaborate: the first to render
 * after a fresh value writes; subsequent mounts read the same buffer.
 * Race-on-mount: a fresh second mount reads the existing buffer
 * immediately, so its sparkline draws with full history right away.
 */
export function useSharedSensorHistory(key: string, value: number): readonly number[] {
  const [, force] = useState(0);

  // Push the latest value into the singleton each render where value
  // changes (effect runs after value mutates).
  useEffect(() => {
    pushPanelSensorSample(key, value);
  }, [key, value]);

  // Subscribe so re-renders happen when other writers push updates.
  useEffect(() => {
    const fn = () => force(n => n + 1);
    subscribe(fn);
    return () => unsubscribe(fn);
  }, []);

  return getPanelSensorHist(key);
}
