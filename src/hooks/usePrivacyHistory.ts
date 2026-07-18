import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';

// Matches nexus-service's PrivacyAccess.RetentionDays - the widest window the
// service actually retains, so the one fetch below never misses a session the
// store still holds. Refined to the response's own retentionDays purely for
// the "showing the last N days" copy; a wider request than the store's real
// retention still returns exactly the same rows, so it never needs a refetch.
const DEFAULT_RETENTION_DAYS = 30;

export interface UsePrivacyHistoryResult {
  sessions: PrivacySession[];
  retentionDays: number;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
  reload: () => void;
}

/**
 * One-shot fetch of every privacy-access session the service still retains
 * (from - DEFAULT_RETENTION_DAYS through now), for PrivacyHistoryModal. Unlike
 * useMonitoringPrivacy this does not poll - the modal is an on-demand audit
 * view, not a live indicator, so a fresh fetch each time it opens (plus a
 * manual `reload`) is enough.
 */
export function usePrivacyHistory(open: boolean): UsePrivacyHistoryResult {
  const [sessions, setSessions] = useState<PrivacySession[]>([]);
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const [supported, setSupported] = useState(true);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    const to = Date.now();
    const from = to - DEFAULT_RETENTION_DAYS * 86_400_000;
    const result = await fetchMonitoringPrivacy({ from, to });
    // A newer load (a reload, or a later open) already started - drop this
    // stale response instead of overwriting its state.
    if (!mountedRef.current || seq !== seqRef.current) return;
    setLoading(false);
    if (result.data) {
      setSessions(result.data.sessions);
      setSupported(result.data.supported);
      setMocked(result.mocked);
      setError(false);
      if (result.data.supported) setRetentionDays(result.data.retentionDays);
      return;
    }
    if (result.unsupported) {
      setSupported(false);
      return;
    }
    setError(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const reload = useCallback(() => { void load(); }, [load]);

  return { sessions, retentionDays, loading, error, mocked, supported, reload };
}
