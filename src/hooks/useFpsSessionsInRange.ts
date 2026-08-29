import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFpsSessionsInRange, type FpsRangeSession } from '../api/fps';

// Trailing debounce for a moving domain (the caller re-renders this on every
// live-follow tick) - resets on every domain change, so a continuously
// sliding window never fetches; only a pause at least this long lets it
// through. Mirrors useMonitoringEvents' own domain-debounce.
const DOMAIN_DEBOUNCE_MS = 250;

export interface UseFpsSessionsInRangeResult {
  sessions: FpsRangeSession[];
  loading: boolean;
}

/**
 * FPS sessions overlapping `domain`, fetched only while `enabled` - backs the
 * monitoring history FPS overlay's session-range masking and hover tooltip,
 * and is reusable by the Frames page for a windowed session lookup. Debounced
 * + seq-guarded like useMonitoringEvents, so a stale in-flight response never
 * overwrites a newer one and disabling clears the list immediately.
 */
export function useFpsSessionsInRange(domain: readonly [number, number], enabled: boolean): UseFpsSessionsInRangeResult {
  const [sessions, setSessions] = useState<FpsRangeSession[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((from: number, to: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    void (async () => {
      const result = await fetchFpsSessionsInRange(from, to);
      if (!mountedRef.current || seq !== seqRef.current) return;
      setSessions(result?.sessions ?? []);
      setLoading(false);
    })();
  }, []);

  const [from, to] = domain;
  useEffect(() => {
    if (!enabled) {
      seqRef.current++;
      setSessions([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      load(from, to);
    }, DOMAIN_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, from, to, load]);

  return { sessions, loading };
}
