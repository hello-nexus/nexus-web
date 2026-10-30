import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGlobalBrightness, setMasterScalesDevices } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';

export interface MasterScalesDevicesState {
  /** Null until the first fetch resolves. */
  on: boolean | null;
  /** Persist the choice. Optimistic; a failed save re-fetches the real value. */
  save: (next: boolean) => Promise<void>;
}

/** Whether master brightness multiplies each device's brightness instead of capping it. */
export function useMasterScalesDevices(enabled: boolean): MasterScalesDevicesState {
  const [on, setOn] = useState<boolean | null>(null);
  // Bumped by every save: a GET that began before one is stale.
  const seqRef = useRef(0);

  const refresh = useCallback(() => {
    const seq = seqRef.current;
    fetchGlobalBrightness().then(data => {
      if (data && seq === seqRef.current) setOn(data.masterScalesDevices === true);
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  const save = useCallback(async (next: boolean) => {
    seqRef.current++;
    setOn(next);
    let ok = false;
    try {
      const res = await setMasterScalesDevices(next) as { error?: boolean } | null;
      ok = res !== null && !res.error;
    } catch { /* an empty or unreadable body counts as a failed save */ }
    if (!ok) refresh();
  }, [refresh]);

  return { on, save };
}
