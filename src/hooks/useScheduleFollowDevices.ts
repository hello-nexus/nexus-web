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
  // A write bumps `genRef` and counts as in flight until it settles. A read is
  // current only if no write started since it was requested and none is in
  // flight now; a POST answer is current only if no newer write for the same key
  // started. So a GET overlapping any write, and an answer overtaken by a newer
  // toggle of its own device, are dropped rather than reverting newer state.
  const genRef = useRef(0);
  const inFlightRef = useRef(0);
  const keyGenRef = useRef(new Map<string, number>());

  const refresh = useCallback(() => {
    const gen = genRef.current;
    fetchScheduleFollowDevices().then(data => {
      if (!data || gen !== genRef.current || inFlightRef.current > 0) return;
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
    keyGenRef.current.set(key, mine);
    inFlightRef.current += 1;
    try {
      const answer = await setScheduleFollowDevice(key, follows);
      if (answer && 'key' in answer && keyGenRef.current.get(key) === mine) setDevices(prev => ({ ...prev, [answer.key]: answer }));
    } catch {
      // The refetch below restores whatever the service holds.
    }
    inFlightRef.current -= 1;
    if (inFlightRef.current === 0) refresh();
  }, [refresh]);

  return { devices, setFollows, refresh };
}
