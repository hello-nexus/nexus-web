import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';
import { normalisePrivacySession, upsertPrivacySession } from './useMonitoringEvents';

// ProcessListSection only ever surfaces a session that's active or ended
// within the recent-activity window (privacyHelpers.ts's RECENT_WINDOW_MS) -
// this window gives that a margin without fetching a full day of history on
// every load.
const WINDOW_MS = 2 * 3_600_000;

export interface UseMonitoringPrivacyResult {
  sessions: PrivacySession[];
  /** The `to` timestamp (UTC ms) the current `sessions` snapshot is known
   *  accurate as of - callers derive "now" from this instead of calling
   *  Date.now() during render. Advances on a real fetch and on a pushed
   *  session that actually changes the list. */
  asOfMs: number;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
}

type LoadOutcome = 'ok' | 'error' | 'unsupported';

/**
 * Loads the local service's privacy-access sessions (webcam/microphone/
 * location/screen capture) once on enable and again on socket reconnect,
 * then keeps the list current via the 'monitoring/privacy' push topic
 * instead of polling. Same unsupported discipline as useMetricHistory: a
 * service that predates the route reports `supported: false` rather than an
 * error, and no further load is attempted (no user-facing retry surface
 * exists for this passive indicator). A transient failure reports
 * `error: true`; recovery comes from the next enable, reconnect, or push -
 * there is no periodic retry poll here anymore.
 */
export function useMonitoringPrivacy(enabled: boolean): UseMonitoringPrivacyResult {
  const [sessions, setSessions] = useState<PrivacySession[]>([]);
  const [asOfMs, setAsOfMs] = useState(() => Date.now());
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  // Persists across an enabled-toggle's effect teardown/rebuild - a
  // straggler from a torn-down instance must not overwrite state a newer
  // instance's response already committed.
  const seqRef = useRef(0);
  // Mirrors `sessions` for the push handler's upsert, which needs to read
  // the latest list synchronously (state itself only updates on commit).
  const sessionsRef = useRef<PrivacySession[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (): Promise<LoadOutcome> => {
    const seq = ++seqRef.current;
    setLoading(true);
    const to = Date.now();
    const result = await fetchMonitoringPrivacy({ from: to - WINDOW_MS, to });
    // A newer load (from this or a later effect instance) already started.
    if (!mountedRef.current || seq !== seqRef.current) return 'ok';
    setLoading(false);
    if (result.data) {
      sessionsRef.current = result.data.sessions;
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
    void load();
  }, [enabled, load]);

  // A dropped socket misses whatever pushed while it was down - resync with
  // a real fetch. Edge-detected off `connected` (no reconnect counter on the
  // multiplex context, matching useMetricHistory/useMonitoringEvents).
  // Gated on `supported` too - a confirmed-unsupported route stays off for
  // the rest of this instance's life, same as it did under the old poll.
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && supported && connected && !prevConnectedRef.current) void load();
    prevConnectedRef.current = connected;
  }, [enabled, supported, connected, load]);

  useTopicCallback('monitoring/privacy', enabled, (raw) => {
    const session = normalisePrivacySession(raw as PrivacySession);
    const next = upsertPrivacySession(sessionsRef.current, session);
    if (next === sessionsRef.current) return;
    sessionsRef.current = next;
    setSessions(next);
    setAsOfMs(prev => Math.max(prev, session.end ?? session.start));
  });

  return { sessions, asOfMs, loading, error, mocked, supported };
}
