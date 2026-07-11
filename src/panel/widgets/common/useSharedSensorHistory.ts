import { useEffect, useRef, useState } from 'react';
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
 *
 * `enabled` (default true) gates every subscription AND the push effect - a
 * disabled caller (e.g. a widget-catalog preview mount) must never write
 * into this shared, key-addressed store: two mounts can share the exact same
 * key (a preview fixture happens to reuse a real category::sensor id), and
 * an ungated push would silently flatline a live widget's history elsewhere.
 */
export function useSharedSensorHistory(key: string, value: number, enabled = true): readonly number[] {
  const [, force] = useState(0);
  const [tick, setTick] = useState(getFrameTick);

  useEffect(() => {
    if (!enabled) return;
    const fn = () => setTick(getFrameTick());
    subscribe(fn);
    return () => unsubscribe(fn);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    pushPanelSensorSample(key, value);
  }, [enabled, key, tick, value]);

  useEffect(() => {
    if (!enabled) return;
    const fn = () => force(n => n + 1);
    subscribePanelSensorKey(key, fn);
    return () => unsubscribePanelSensorKey(key, fn);
  }, [enabled, key]);

  return getPanelSensorHist(key);
}

/**
 * Sample-only companion to useSharedSensorHistory: pushes `value` into the
 * key's buffer on every monitoring frame, without reading it back or
 * re-rendering the host. Mount at page level so a sensor's sparkline keeps
 * filling across tab switches. pushPanelSensorSample dedups by key+frameTick,
 * so pairing this with a tab's own useSharedSensorHistory never double-samples.
 */
export function useSensorHistoryFeed(key: string, value: number): void {
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const fn = () => pushPanelSensorSample(key, valueRef.current);
    subscribe(fn);
    return () => unsubscribe(fn);
  }, [key]);
}
