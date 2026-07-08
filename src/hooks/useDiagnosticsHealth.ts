import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiagnosticsHealth, type DiagnosticsHealth } from '../api/diagnostics';

const POLL_MS = 15_000;

export interface UseDiagnosticsHealth {
  health: DiagnosticsHealth | null;
  loading: boolean;
  error: boolean;
}

/**
 * Polls GET /diagnostics/health every 15s while `enabled`. Shared by the
 * DiagnosticsView header/overview and the panel widget so both read the same
 * cadence from one hook instead of two independent pollers.
 */
export function useDiagnosticsHealth(enabled: boolean): UseDiagnosticsHealth {
  const [health, setHealth] = useState<DiagnosticsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    void (async () => {
      const result = await fetchDiagnosticsHealth();
      if (!mountedRef.current) return;
      if (result !== null) {
        setHealth(result);
        setError(false);
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

  return { health, loading, error };
}
