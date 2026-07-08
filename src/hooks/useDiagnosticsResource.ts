import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagnosticsFetchResult } from '../api/diagnostics';

export interface DiagnosticsResourceState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  refresh: () => void;
}

/**
 * Fetch-on-mount + manual-refresh for one diagnostics REST resource. Shared
 * by every /diagnostics/* section (smart, memory, gpu, cooling, system,
 * incidents) so each one isn't a bespoke copy of the same fetch/mount-guard
 * boilerplate; the health overview polls separately via useDiagnosticsHealth
 * since it has its own polling interval instead of a manual refresh.
 */
export function useDiagnosticsResource<T>(
  enabled: boolean,
  fetcher: () => Promise<DiagnosticsFetchResult<T>>,
): DiagnosticsResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Guards against a slower earlier request resolving after a newer one (a
  // manual refresh fired mid-flight): only the response matching the most
  // recently dispatched call is allowed to commit state.
  const seqRef = useRef(0);

  const load = useCallback(() => {
    setLoading(true);
    const seq = ++seqRef.current;
    void (async () => {
      const result = await fetcherRef.current();
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (result.data !== null) {
        setData(result.data);
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
    if (enabled) load();
    else setLoading(false);
    return () => { mountedRef.current = false; };
  }, [enabled, load]);

  return { data, loading, error, mocked, refresh: load };
}
