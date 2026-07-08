import { useCallback, useEffect, useRef, useState } from 'react';

export interface DiagnosticsResourceState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/**
 * Fetch-on-mount + manual-refresh for one diagnostics REST resource. Shared
 * by every /diagnostics/* section (smart, memory, gpu, cooling, system,
 * incidents) so each one isn't a bespoke copy of the same fetch/mount-guard
 * boilerplate; the health overview polls separately via useDiagnosticsHealth
 * since it has its own 15s interval instead of a manual refresh.
 */
export function useDiagnosticsResource<T>(
  enabled: boolean,
  fetcher: () => Promise<T | null>,
): DiagnosticsResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    setLoading(true);
    void (async () => {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;
      if (result !== null) {
        setData(result);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) load();
    else setLoading(false);
    return () => { mountedRef.current = false; };
  }, [enabled, load]);

  return { data, loading, error, refresh: load };
}
