import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFanChannels, type FanChannel } from '../../../api/cooling';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';

const POLL_MS = 15_000;
const TOPIC_DEBOUNCE_MS = 400;
const NO_CHANNELS: readonly FanChannel[] = [];

/** The Cooling page's fan channels, polled while `enabled`; a failed poll keeps the last good list, so rows never flicker; empty when disabled. */
export function useCoolingFanChannels(enabled: boolean): readonly FanChannel[] {
  const [channels, setChannels] = useState<readonly FanChannel[]>(NO_CHANNELS);
  const aliveRef = useRef(false);
  const load = useCallback(() => {
    fetchFanChannels().then(res => { if (aliveRef.current && res?.channels) setChannels(res.channels); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    aliveRef.current = true;
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { aliveRef.current = false; window.clearInterval(timer); };
  }, [enabled, load]);
  // A control toggle, here or on the Cooling page, pushes the cooling topic; debounced because a duty drag pushes it often.
  const topicTimerRef = useRef<number | undefined>(undefined);
  useTopicCallback('cooling', enabled, () => {
    window.clearTimeout(topicTimerRef.current);
    topicTimerRef.current = window.setTimeout(load, TOPIC_DEBOUNCE_MS);
  });
  useEffect(() => () => window.clearTimeout(topicTimerRef.current), []);
  return enabled ? channels : NO_CHANNELS;
}
