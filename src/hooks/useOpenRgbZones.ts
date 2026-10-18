import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchOpenRgbZones, setOpenRgbZoneSize, type OpenRgbZoneDevice } from '../api/openRgbZones';
import { useTopicCallback } from './useMultiplexSocket';

/** The service queues a resize for the RGB process, so the stored count lags the write. */
const SETTLE_TRIES = 6;
const SETTLE_DELAY_MS = 500;

/** Devices with a user-sizable zone; refetched on every lighting signal so a write from anywhere shows up. */
export function useOpenRgbZones(enabled: boolean) {
  const [devices, setDevices] = useState<OpenRgbZoneDevice[]>([]);
  const mounted = useRef(true);
  // A slow older fetch must never overwrite a newer answer.
  const fetchSeq = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async (): Promise<OpenRgbZoneDevice[] | null> => {
    const seq = ++fetchSeq.current;
    const res = await fetchOpenRgbZones().catch(() => null);
    if (!res || res.error || !mounted.current || seq !== fetchSeq.current) return null;
    const next = res.devices ?? [];
    setDevices(next);
    return next;
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, () => { void refresh(); });

  /**
   * Resolves false when the service refused the size. On success it resolves
   * once a fetch reports the new count, or after a bounded wait, so a caller
   * can hold its own draft until then.
   */
  const setSize = useCallback(async (deviceId: string, zoneIndex: number, ledCount: number) => {
    const res = await setOpenRgbZoneSize(deviceId, zoneIndex, ledCount).catch(() => null);
    if (res == null || res.error) {
      await refresh();
      return false;
    }
    for (let i = 0; i < SETTLE_TRIES && mounted.current; i++) {
      const next = await refresh();
      const zone = next?.find(d => d.deviceId === deviceId)?.zones.find(z => z.index === zoneIndex);
      if (zone && zone.ledCount === ledCount) break;
      await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));
    }
    return true;
  }, [refresh]);

  return useMemo(() => ({ devices, refresh, setSize }), [devices, refresh, setSize]);
}
