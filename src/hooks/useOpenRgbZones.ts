import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchOpenRgbZones, setOpenRgbZoneSize, type OpenRgbZoneDevice } from '../api/openRgbZones';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * The service queues a resize for the RGB process, so the stored count lags the
 * write. A lighting frame announces the applied resize; the bounded poll is the
 * fallback when none arrives.
 */
const SETTLE_TRIES = 6;
const SETTLE_DELAY_MS = 500;

/** Devices with a user-sizable zone; refetched on every lighting signal so a write from anywhere shows up. */
export function useOpenRgbZones(enabled: boolean) {
  const [devices, setDevices] = useState<OpenRgbZoneDevice[]>([]);
  const mounted = useRef(true);
  // A slow older fetch must never overwrite a newer answer.
  const fetchSeq = useRef(0);
  // Writes waiting for their count to show up, by zone; a newer write to the same zone supersedes.
  const waiters = useRef(new Map<string, { count: number; done: () => void }>());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async (): Promise<OpenRgbZoneDevice[] | null> => {
    const seq = ++fetchSeq.current;
    const res = await fetchOpenRgbZones().catch(() => null);
    if (!res || res.error || !mounted.current || seq !== fetchSeq.current) return null;
    // A split device's counts have one editor, the LED map; it gets no block here.
    const next = (res.devices ?? []).filter(d => d.splitOwned !== true);
    setDevices(next);
    for (const [key, w] of [...waiters.current]) {
      const [deviceId, index] = key.split('|');
      const zone = next.find(d => d.deviceId === deviceId)?.zones.find(z => z.index === Number(index));
      if (zone?.ledCount === w.count) w.done();
    }
    return next;
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, () => { void refresh(); });

  /**
   * Resolves false when the service refused the size. On success it resolves
   * once a fetch (from a lighting frame or the fallback poll) reports the new
   * count, or after a bounded wait, so a caller can hold its draft until then.
   */
  const setSize = useCallback(async (deviceId: string, zoneIndex: number, ledCount: number) => {
    const key = `${deviceId}|${zoneIndex}`;
    waiters.current.get(key)?.done();
    const res = await setOpenRgbZoneSize(deviceId, zoneIndex, ledCount).catch(() => null);
    if (res == null || res.error) {
      await refresh();
      return false;
    }
    await new Promise<void>(resolve => {
      let finished = false;
      const waiter = {
        count: ledCount,
        done: () => {
          if (finished) return;
          finished = true;
          if (waiters.current.get(key) === waiter) waiters.current.delete(key);
          resolve();
        },
      };
      waiters.current.set(key, waiter);
      void (async () => {
        for (let i = 0; i < SETTLE_TRIES && !finished && mounted.current; i++) {
          await refresh();
          if (finished || i === SETTLE_TRIES - 1) break;
          await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));
        }
        waiter.done();
      })();
    });
    return true;
  }, [refresh]);

  return useMemo(() => ({ devices, refresh, setSize }), [devices, refresh, setSize]);
}
