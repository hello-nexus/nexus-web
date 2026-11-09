import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchScheduleFollowDevices, setScheduleFollowDevice, type ScheduleFollowDevice } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';

export interface ScheduleFollowDevicesState {
  /** By device key; a device the service does not list does not follow the schedule. */
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
  // The newest write's number, and the newest one that has settled. A read is
  // current only if no write started since it was requested and the newest
  // write has settled; a POST answer is current only if no newer write started.
  // So a GET that overlaps a write, and an answer overtaken by a newer toggle,
  // are dropped rather than reverting the newer state.
  const genRef = useRef(0);
  const settledRef = useRef(0);

  const refresh = useCallback(() => {
    const gen = genRef.current;
    fetchScheduleFollowDevices().then(data => {
      if (!data || gen !== genRef.current || settledRef.current !== genRef.current) return;
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
      [key]: prev[key] ? { ...prev[key], follows } : { key, follows, levelPercent: 100, appliedPercent: null },
    }));
    const mine = ++genRef.current;
    try {
      const answer = await setScheduleFollowDevice(key, follows);
      if (answer && 'key' in answer && mine === genRef.current) setDevices(prev => ({ ...prev, [answer.key]: answer }));
    } catch {
      // The refetch below restores whatever the service holds.
    }
    settledRef.current = Math.max(settledRef.current, mine);
    refresh();
  }, [refresh]);

  return { devices, setFollows, refresh };
}
