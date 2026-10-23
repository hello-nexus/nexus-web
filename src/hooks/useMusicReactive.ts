import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMusicReactive, setMusicReactive } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';

export interface MusicReactiveState {
  enabled: boolean;
  toggle: () => void;
  /** Re-reads the flag through the same stale-read guard; for a caller that knows it may have changed. */
  refresh: () => void;
}

/**
 * The service-wide Music Reactive flag. Every mounted user reads and writes the
 * same setting and follows the service's lighting topic, which it bumps on each
 * change, so a toggle anywhere shows live everywhere.
 */
export function useMusicReactive(active: boolean): MusicReactiveState {
  const [enabled, setEnabled] = useState(false);
  // Bumped on every local write; a read started before it returns an older value.
  const writeSeq = useRef(0);
  const pendingWrites = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const load = useCallback(() => {
    const seq = writeSeq.current;
    fetchMusicReactive()
      .then(r => {
        if (!r || seq !== writeSeq.current || pendingWrites.current > 0) return;
        setEnabled(!!r.enabled);
      })
      .catch(() => { /* keep the current value */ });
  }, []);

  useEffect(() => { if (active) load(); }, [active, load]);
  useTopicCallback('lighting', active, load);

  const toggle = useCallback(() => {
    const prev = enabledRef.current;
    const next = !prev;
    writeSeq.current += 1;
    pendingWrites.current += 1;
    setEnabled(next);
    // postService resolves null on a failed write rather than rejecting.
    setMusicReactive(next)
      .then(r => { if (!r) setEnabled(prev); }, () => setEnabled(prev))
      .finally(() => {
        pendingWrites.current -= 1;
        if (pendingWrites.current === 0) load();
      });
  }, [load]);

  return { enabled, toggle, refresh: load };
}
