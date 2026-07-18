import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';

const POLL_MS = 5_000;
// Retry cadence after a transient failure - backs off from the normal poll
// interval until a fetch succeeds, then POLL_MS resumes.
const ERROR_RETRY_MS = 30_000;
// ProcessListSection only ever surfaces a session that's active or ended
// within the recent-activity window (privacyHelpers.ts's RECENT_WINDOW_MS) -
// this window gives that a margin without fetching a full day of history on
// every poll.
const WINDOW_MS = 2 * 3_600_000;

export interface UseMonitoringPrivacyResult {
  sessions: PrivacySession[];
  /** The `to` timestamp (UTC ms) the current `sessions` snapshot was fetched
   *  as of - callers derive "now" from this instead of calling Date.now()
   *  during render. */
  asOfMs: number;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
}

type LoadOutcome = 'ok' | 'error' | 'unsupported';

/**
 * Polls the local service's privacy-access sessions (webcam/microphone/
 * location/screen capture) while `enabled`. Same unsupported discipline as
 * useMetricHistory: a service that predates the route reports
 * `supported: false` rather than an error, and polling stops there for good
 * (no user-facing retry surface exists for this passive indicator). A
 * transient failure instead backs off to ERROR_RETRY_MS and keeps retrying,
 * resuming POLL_MS on the next success - a privacy indicator must not go
 * permanently silent (and risk rendering a frozen, possibly-active icon)
 * over one dropped request.
 */
export function useMonitoringPrivacy(enabled: boolean): UseMonitoringPrivacyResult {
  const [sessions, setSessions] = useState<PrivacySession[]>([]);
  const [asOfMs, setAsOfMs] = useState(() => Date.now());
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  // Persists across an enabled-toggle's effect teardown/rebuild (unlike the
  // scheduling loop's own local `cancelled`, which is per-instance) - a
  // straggler from a torn-down instance must not overwrite state a newer
  // instance's response already committed.
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (): Promise<LoadOutcome> => {
    const seq = ++seqRef.current;
    setLoading(true);
    const to = Date.now();
    const result = await fetchMonitoringPrivacy({ from: to - WINDOW_MS, to });
    // A newer load (from this or a later effect instance) already started -
    // the caller's own `cancelled` flag independently stops a torn-down
    // instance's scheduling loop, so only the state commit needs guarding.
    if (!mountedRef.current || seq !== seqRef.current) return 'ok';
    setLoading(false);
    if (result.data) {
      setSessions(result.data.sessions);
      setAsOfMs(to);
      setSupported(result.data.supported);
      setMocked(result.mocked);
      setError(false);
      return result.data.supported ? 'ok' : 'unsupported';
    }
    if (result.unsupported) {
      setSupported(false);
      return 'unsupported';
    }
    setError(true);
    return 'error';
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    const run = () => {
      void load().then(outcome => {
        if (cancelled) return;
        // A confirmed-unsupported route stays off until re-enabled or
        // remounted - retrying it can never succeed.
        if (outcome === 'unsupported') return;
        timer = window.setTimeout(run, outcome === 'error' ? ERROR_RETRY_MS : POLL_MS);
      });
    };
    run();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, load]);

  return { sessions, asOfMs, loading, error, mocked, supported };
}
