import { useEffect, useMemo, useState } from 'react';
import { fetchOpenRgbZones } from '../api/openRgbZones';
import { deviceNeedsSize } from '../panel/widgets/devices/zoneSizeUtils';

/** OpenRGB devices still waiting for a user-chosen LED count; refetched only when a device or its LED count changes. */
export function useZoneSizeDeviceIds(enabled: boolean, devices: readonly { id: string; ledCount: number }[] | null): Set<string> {
  const devicesKey = devices == null ? '' : devices.map(d => `${d.id}:${d.ledCount}`).sort().join('\n');
  const [idsKey, setIdsKey] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchOpenRgbZones()
      .then(res => {
        if (cancelled || !res || res.error) return;
        // A split device's counts have one editor, the LED map; no card links here.
        const ids = (res.devices ?? []).filter(d => d.splitOwned !== true && deviceNeedsSize(d)).map(d => d.deviceId);
        setIdsKey(ids.sort().join('\n'));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, devicesKey]);

  return useMemo(() => new Set(idsKey ? idsKey.split('\n') : []), [idsKey]);
}
