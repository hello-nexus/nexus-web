import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchOpenRgbZones, setOpenRgbZoneSize, type OpenRgbZoneDevice } from '../api/openRgbZones';
import { useTopicCallback } from './useMultiplexSocket';

/** Devices with a user-sizable zone; refetched on every lighting signal so a write from anywhere shows up. */
export function useOpenRgbZones(enabled: boolean) {
  const [devices, setDevices] = useState<OpenRgbZoneDevice[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetchOpenRgbZones().catch(() => null);
    if (!res || res.error || !mounted.current) return;
    setDevices(res.devices ?? []);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, () => { void refresh(); });

  /** Resolves false when the service refused the size; the refetch restores the stored count either way. */
  const setSize = useCallback(async (deviceId: string, zoneIndex: number, ledCount: number) => {
    const res = await setOpenRgbZoneSize(deviceId, zoneIndex, ledCount).catch(() => null);
    await refresh();
    return res != null && !res.error;
  }, [refresh]);

  return useMemo(() => ({ devices, refresh, setSize }), [devices, refresh, setSize]);
}
