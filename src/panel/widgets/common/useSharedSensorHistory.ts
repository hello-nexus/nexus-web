import { useEffect, useState } from 'react';
import {
  getFrameTick,
  getPanelSensorHist,
  pushPanelSensorSample,
  subscribe,
  subscribePanelSensorKey,
  unsubscribe,
  unsubscribePanelSensorKey,
} from '../../../lib/monitoringStore';

/**
 * Per-sensor 60-sample history backed by the shared monitoringStore
 * singleton. Same key (e.g. `cpu::CPU Total`) read from any panel cell
 * returns the SAME buffer, so re-mounting a PerfSlot in the immersive
 * view picks up the existing 60 s of samples.
 *
 * Pushes are driven by the monitoring frameTick, not the sensor value: a
 * run of identical readings (e.g. GPU temp pinned at 45 °C) must still
 * advance the sparkline, and gating on [key, value] drops those frames.
 *
 * Subscription is per-key: only consumers of "cpu::CPU Total" wake on a
 * CPU push, so a GPU tile next door doesn't re-render on every CPU sample.
 */
export function useSharedSensorHistory(key: string, value: number): readonly number[] {
  const [, force] = useState(0);
  const [tick, setTick] = useState(getFrameTick);

  useEffect(() => {
    const fn = () => setTick(getFrameTick());
    subscribe(fn);
    return () => unsubscribe(fn);
  }, []);

  useEffect(() => {
    pushPanelSensorSample(key, value);
  }, [key, tick, value]);

  useEffect(() => {
    const fn = () => force(n => n + 1);
    subscribePanelSensorKey(key, fn);
    return () => unsubscribePanelSensorKey(key, fn);
  }, [key]);

  return getPanelSensorHist(key);
}
