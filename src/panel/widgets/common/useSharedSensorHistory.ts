import { useEffect, useState } from 'react';
import {
  getPanelSensorHist,
  pushPanelSensorSample,
  subscribePanelSensorKey,
  unsubscribePanelSensorKey,
} from '../../../lib/monitoringStore';

/**
 * Per-sensor 60-sample history backed by the shared monitoringStore
 * singleton. Same key (e.g. `cpu::CPU Total`) read from any panel cell
 * returns the SAME buffer - so re-mounting a PerfSlot in the immersive
 * view picks up the existing 60 s of samples instead of starting fresh.
 *
 * Subscription is per-key: only consumers of "cpu::CPU Total" wake on a
 * CPU push, so a GPU tile sitting next door doesn't re-render every time
 * the CPU sample lands.
 */
export function useSharedSensorHistory(key: string, value: number): readonly number[] {
  const [, force] = useState(0);

  useEffect(() => {
    pushPanelSensorSample(key, value);
  }, [key, value]);

  useEffect(() => {
    const fn = () => force(n => n + 1);
    subscribePanelSensorKey(key, fn);
    return () => unsubscribePanelSensorKey(key, fn);
  }, [key]);

  return getPanelSensorHist(key);
}
