import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchScheduleFollowDevices, setScheduleFollowDevice, type ScheduleFollowDevice } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';

export interface ScheduleFollowDevicesState {
  /** By device key; a device the service does not list follows the schedule. */
  devices: Record<string, ScheduleFollowDevice>;
  /** Optimistic: the entry updates before the POST answers, and the `lighting` topic re-syncs it. */
  setFollows: (key: string, follows: boolean) => Promise<void>;
  /** Read the list again now (the popover opening). */
  refresh: () => void;
}

/**
 * Which devices follow the brightness schedule, and the level each wears now,
 * kept in sync with the `lighting` topic every schedule write publishes.
 */
export function useScheduleFollowDevices(enabled: boolean): ScheduleFollowDevicesState {
  const [devices, setDevices] = useState<Record<string, ScheduleFollowDevice>>({});
  // A GET that lands while a write is in flight may carry the old state.
  const pendingRef = useRef(0);

  const refresh = useCallback(() => {
    fetchScheduleFollowDevices().then(data => {
      if (!data || pendingRef.current > 0) return;
      setDevices(Object.fromEntries((data.devices ?? []).map(d => [d.key, d])));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  const setFollows = useCallback(async (key: string, follows: boolean) => {
    setDevices(prev => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], follows, capPercent: undefined } : { key, follows, levelPercent: 100, appliedPercent: null },
    }));
    pendingRef.current += 1;
    try {
      const answer = await setScheduleFollowDevice(key, follows);
      if (answer && 'key' in answer) setDevices(prev => ({ ...prev, [answer.key]: answer }));
    } catch {
      // The refetch below restores whatever the service holds.
    } finally {
      pendingRef.current -= 1;
    }
    refresh();
  }, [refresh]);

  return { devices, setFollows, refresh };
}
