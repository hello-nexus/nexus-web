import { useEffect, useState } from 'react';
import { fetchFanChannels, type FanChannel } from '../../../api/cooling';

const POLL_MS = 15_000;
const NO_CHANNELS: readonly FanChannel[] = [];

/** The Cooling page's fan channels, polled while `enabled`; empty when disabled or unreachable, so Diagnostics then behaves as it does without Cooling. */
export function useCoolingFanChannels(enabled: boolean): readonly FanChannel[] {
  const [channels, setChannels] = useState<readonly FanChannel[]>(NO_CHANNELS);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => {
      fetchFanChannels().then(res => { if (alive) setChannels(res?.channels ?? NO_CHANNELS); }).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [enabled]);
  return enabled ? channels : NO_CHANNELS;
}
