import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiagnosticsHealth, type DiagnosticsFetchOptions, type DiagnosticsHealth } from '../api/diagnostics';

const POLL_MS = 15_000;

export interface UseDiagnosticsHealth {
  health: DiagnosticsHealth | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  refresh: (opts?: DiagnosticsFetchOptions) => void;
}

/**
 * Polls GET /diagnostics/health at the POLL_MS cadence while `enabled`.
 * Shared by the DiagnosticsView header/overview and the panel widget so both
 * read the same poll from one hook instead of two independent pollers.
 */
export function useDiagnosticsHealth(enabled: boolean): UseDiagnosticsHealth {
  const [health, setHealth] = useState<DiagnosticsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  // Guards against a slower earlier poll resolving after a newer one already
  // landed (or a manual retry raced the interval); only the response
  // matching the most recently dispatched call is allowed to commit state.
  const seqRef = useRef(0);

  const load = useCallback((opts?: DiagnosticsFetchOptions) => {
    setLoading(true);
    const seq = ++seqRef.current;
    void (async () => {
      const result = await fetchDiagnosticsHealth(opts);
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (result.data !== null) {
        setHealth(result.data);
        setError(false);
        setMocked(result.mocked);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, load]);

  return { health, loading, error, mocked, refresh: load };
}
