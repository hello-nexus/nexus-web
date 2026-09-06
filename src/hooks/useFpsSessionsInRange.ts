import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFpsSessionsInRange, type FpsRangeSession } from '../api/fps';

// Trailing debounce for a moving domain, so a pan settles before it fetches.
const DOMAIN_DEBOUNCE_MS = 250;
// The service reports the run in progress as a session ending "now", so only
// a refetch reveals a game started since the last one.
const LIVE_REFRESH_MS = 5000;
// A domain that still sits inside the last fetched (or in-flight) window,
// extended by this much past its end, is served from that fetch. The periodic
// refresh re-covers the current domain every LIVE_REFRESH_MS, so a following
// chart, whose end advances one live-tail poll per tick (LIVE_TAIL_POLL_MS in
// useMetricHistory), never reaches the slack; only a real pan or zoom does.
const COVERAGE_SLACK_MS = 3 * LIVE_REFRESH_MS;

/** A session from the range query, flagged when it was still running at fetch time. */
export interface FpsOverlaySession extends FpsRangeSession {
  inProgress: boolean;
}

export interface UseFpsSessionsInRangeResult {
  sessions: FpsOverlaySession[];
  loading: boolean;
}

function sameSessions(a: readonly FpsOverlaySession[], b: readonly FpsOverlaySession[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.startedUtcMs !== y.startedUtcMs || x.endedUtcMs !== y.endedUtcMs
      || x.avgFps !== y.avgFps || x.inProgress !== y.inProgress) return false;
  }
  return true;
}

function withinWindow(window: readonly [number, number] | null, from: number, to: number): boolean {
  return window !== null && from >= window[0] && to <= window[1] + COVERAGE_SLACK_MS;
}

/**
 * FPS sessions overlapping `domain`, for the Monitoring chart's FPS overlay.
 * Fetches when the domain leaves the window the last response covered and
 * refreshes that window quietly every LIVE_REFRESH_MS so a session that just
 * started or ended shows up without a poll per chart tick. The session still
 * running at fetch time is flagged so the overlay can treat it as open-ended
 * between refreshes.
 */
export function useFpsSessionsInRange(domain: readonly [number, number], enabled: boolean): UseFpsSessionsInRangeResult {
  const [sessions, setSessions] = useState<FpsOverlaySession[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const debounceRef = useRef<number | null>(null);
  const coveredRef = useRef<readonly [number, number] | null>(null);
  const inFlightRef = useRef<readonly [number, number] | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((from: number, to: number, quiet = false) => {
    const seq = ++seqRef.current;
    inFlightRef.current = [from, to];
    if (!quiet) setLoading(true);
    void (async () => {
      const result = await fetchFpsSessionsInRange(from, to);
      if (!mountedRef.current || seq !== seqRef.current) return;
      inFlightRef.current = null;
      if (result !== null) coveredRef.current = [from, to];
      const nowMs = Date.now();
      const next: FpsOverlaySession[] = (result?.sessions ?? []).map(s => ({
        ...s,
        inProgress: nowMs - s.endedUtcMs <= LIVE_REFRESH_MS,
      }));
      setSessions(prev => (sameSessions(prev, next) ? prev : next));
      if (!quiet) setLoading(false);
    })();
  }, []);

  const [from, to] = domain;
  useEffect(() => {
    if (!enabled) {
      seqRef.current++;
      coveredRef.current = null;
      inFlightRef.current = null;
      setSessions([]);
      setLoading(false);
      return;
    }
    if (withinWindow(coveredRef.current, from, to) || withinWindow(inFlightRef.current, from, to)) return;
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

  const domainRef = useRef<readonly [number, number]>(domain);
  useEffect(() => { domainRef.current = [from, to]; }, [from, to]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const [f, t] = domainRef.current;
      load(f, t, true);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  return { sessions, loading };
}
