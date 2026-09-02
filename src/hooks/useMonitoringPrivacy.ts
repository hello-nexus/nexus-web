import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';
import { normalisePrivacySession, upsertPrivacySession } from './useMonitoringEvents';

// ProcessListSection only ever surfaces a session that's active or ended
// within the recent-activity window (privacyHelpers.ts's RECENT_WINDOW_MS) -
// this window gives that a margin without fetching a full day of history on
// every load.
const WINDOW_MS = 2 * 3_600_000;
// asOfMs ticks forward on this cadence (no network call) so a session that
// ended stays "recent" only for as long as privacyHelpers.ts's RECENT_WINDOW_MS
// (1h) actually says - without this, asOfMs would freeze at the last fetch/
// push and an ended session's icon would never age out on its own. A minute
// is comfortably fine-grained against an hour-wide window.
const ASOF_TICK_MS = 60_000;
// One bounded retry after a failed load() - not a poll loop like the
// deleted backoff, just enough for a transient blip to clear on its own
// before the passive indicator goes dark until the next enable/reconnect/push.
const ERROR_RETRY_MS = 30_000;

export interface UseMonitoringPrivacyResult {
  sessions: PrivacySession[];
  /** The `to` timestamp (UTC ms) the current `sessions` snapshot is known
   *  accurate as of - callers derive "now" from this instead of calling
   *  Date.now() during render. Advances on a real fetch, on a pushed
   *  session that actually changes the list, and on a coarse tick
   *  (ASOF_TICK_MS) so an already-known session's recency keeps aging. */
  asOfMs: number;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
}

/**
 * Loads the local service's privacy-access sessions (webcam/microphone/
 * location/screen capture) once on enable and again on socket reconnect,
 * then keeps the list current via the 'monitoring/privacy' push topic. Same
 * unsupported discipline as useMetricHistory: a service that predates the
 * route reports `supported: false` and no further load is attempted (no
 * user-facing retry surface exists for this passive indicator). A transient
 * failure reports `error: true` and gets one bounded retry; a push arriving
 * afterward also clears it, since receiving one proves the route works.
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
  // True for the span between a load() call starting and its response
  // committing - gates the reconnect effect (skip a redundant concurrent
  // fetch while one is already in flight) and buffers pushes that land
  // mid-flight so they survive load()'s wholesale replace of sessionsRef (a
  // push postdating the GET request would otherwise be silently discarded
  // when that GET's response commits, e.g. an `end` push overwritten by the
  // GET's still-open session, stranding an active webcam/mic icon).
  const loadInFlightRef = useRef(false);
  const pendingPushesRef = useRef<PrivacySession[]>([]);
  const errorRetryTimerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);

  const clearErrorRetry = useCallback(() => {
    if (errorRetryTimerRef.current !== undefined) {
      window.clearTimeout(errorRetryTimerRef.current);
      errorRetryTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; clearErrorRetry(); };
  }, [clearErrorRetry]);

  // isRetry distinguishes the one bounded retry's own recursive call from a
  // fresh call (enable/reconnect) - only a fresh call's failure schedules a
  // retry, so the retry's own failure does not reschedule itself into a
  // poll loop.
  const load = useCallback(async (isRetry = false): Promise<void> => {
    const seq = ++seqRef.current;
    loadInFlightRef.current = true;
    pendingPushesRef.current = [];
    if (!isRetry) clearErrorRetry();
    setLoading(true);
    const to = Date.now();
    const result = await fetchMonitoringPrivacy({ from: to - WINDOW_MS, to });
    // A newer load (from this or a later effect instance) already started.
    if (!mountedRef.current || seq !== seqRef.current) return;
    loadInFlightRef.current = false;
    setLoading(false);
    if (result.data) {
      let next = result.data.sessions;
      for (const session of pendingPushesRef.current) next = upsertPrivacySession(next, session);
      pendingPushesRef.current = [];
      sessionsRef.current = next;
      setSessions(next);
      setAsOfMs(to);
      setSupported(result.data.supported);
      setMocked(result.mocked);
      setError(false);
      return;
    }
    pendingPushesRef.current = [];
    if (result.unsupported) {
      setSupported(false);
      return;
    }
    setError(true);
    if (!isRetry) {
      errorRetryTimerRef.current = window.setTimeout(() => {
        errorRetryTimerRef.current = undefined;
        if (mountedRef.current) void load(true);
      }, ERROR_RETRY_MS);
    }
  }, [clearErrorRetry]);

  useEffect(() => {
    if (!enabled) {
      clearErrorRetry();
      return;
    }
    void load();
  }, [enabled, load, clearErrorRetry]);

  // A dropped socket misses whatever pushed while it was down - resync with
  // a real fetch. Edge-detected off `connected` (no reconnect counter on the
  // multiplex context, matching useMetricHistory/useMonitoringEvents).
  // Gated on `supported` too - a confirmed-unsupported route stays off for
  // the rest of this instance's life. Skipped while a load is already in
  // flight (e.g. the initial bootstrap racing the socket's own first open).
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && supported && connected && !prevConnectedRef.current && !loadInFlightRef.current) void load();
    prevConnectedRef.current = connected;
  }, [enabled, supported, connected, load]);

  // Advances asOfMs on its own cadence, independent of any fetch/push - see
  // ASOF_TICK_MS.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setAsOfMs(Date.now()), ASOF_TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useTopicCallback('monitoring/privacy', enabled, (raw) => {
    const session = normalisePrivacySession(raw as PrivacySession);
    if (loadInFlightRef.current) pendingPushesRef.current.push(session);
    const next = upsertPrivacySession(sessionsRef.current, session);
    // A push landing proves the route works - clear any stale error even on
    // a no-op push (a replayed/duplicate frame during an outage is still
    // evidence connectivity recovered).
    clearErrorRetry();
    setError(false);
    if (next === sessionsRef.current) return;
    sessionsRef.current = next;
    setSessions(next);
    setAsOfMs(prev => Math.max(prev, session.end ?? session.start));
  });

  return { sessions, asOfMs, loading, error, mocked, supported };
}
