import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';

const POLL_MS = 5_000;
// ProcessListSection only ever surfaces a session that's active or ended
// within the last hour (privacyHelpers.ts's RECENT_WINDOW_MS) - this window
// gives that a margin without fetching a full day of history on every poll.
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

/**
 * Polls the local service's privacy-access sessions (webcam/microphone/
 * location/screen capture) every ~5s while `enabled`. Same discipline as
 * useMetricHistory: a service that predates the route reports
 * `supported: false` rather than an error, and polling stops once the route
 * is known unsupported or the last fetch failed, so a missing or broken
 * route isn't polled forever.
 */
export function useMonitoringPrivacy(enabled: boolean): UseMonitoringPrivacyResult {
  const [sessions, setSessions] = useState<PrivacySession[]>([]);
  const [asOfMs, setAsOfMs] = useState(() => Date.now());
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    const to = Date.now();
    void (async () => {
      const result = await fetchMonitoringPrivacy({ from: to - WINDOW_MS, to });
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (result.data) {
        setSessions(result.data.sessions);
        setAsOfMs(to);
        setSupported(result.data.supported);
        setMocked(result.mocked);
        setError(false);
      } else if (result.unsupported) {
        setSupported(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!enabled || !supported || error) return;
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, load, supported, error]);

  return { sessions, asOfMs, loading, error, mocked, supported };
}
