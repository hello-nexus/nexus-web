import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringProcessInfo, type ProcessInfoResponse } from '../api/monitoringProcessInfo';

const POLL_MS = 5_000;
// Retry cadence after a transient failure - backs off from the normal poll
// interval until a fetch succeeds, then POLL_MS resumes.
const ERROR_RETRY_MS = 30_000;

export interface UseMonitoringProcessInfoResult {
  data: ProcessInfoResponse | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
}

type LoadOutcome = 'ok' | 'error' | 'unsupported';

/**
 * Fetches (and lightly polls while open) one process's metadata for the
 * process-detail slideout. `enabled` gates fetching to the slideout actually
 * being open - a service that predates the route reports `supported: false`
 * rather than an error, and polling stops there for good, same discipline as
 * useMonitoringPrivacy. A transient failure backs off to ERROR_RETRY_MS
 * instead of going permanently silent.
 */
export function useMonitoringProcessInfo(enabled: boolean, name: string): UseMonitoringProcessInfoResult {
  const [data, setData] = useState<ProcessInfoResponse | null>(null);
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

  // A name change (a different row opened) must not keep showing the
  // previous process's stale data while the new fetch is in flight.
  useEffect(() => {
    setData(null);
    setSupported(true);
    setError(false);
    setMocked(false);
  }, [name]);

  const load = useCallback(async (): Promise<LoadOutcome> => {
    const seq = ++seqRef.current;
    setLoading(true);
    const result = await fetchMonitoringProcessInfo(name);
    if (!mountedRef.current || seq !== seqRef.current) return 'ok';
    setLoading(false);
    if (result.data) {
      setData(result.data);
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
  }, [name]);

  useEffect(() => {
    if (!enabled || !name) return;
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    const run = () => {
      void load().then(outcome => {
        if (cancelled) return;
        if (outcome === 'unsupported') return;
        timer = window.setTimeout(run, outcome === 'error' ? ERROR_RETRY_MS : POLL_MS);
      });
    };
    run();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, name, load]);

  return { data, loading, error, mocked, supported };
}
