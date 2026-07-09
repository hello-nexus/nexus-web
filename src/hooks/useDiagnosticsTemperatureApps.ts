import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiagnosticsTemperatureApps, type DiagnosticsTemperatureAppsResponse, type DiagnosticsTemperatureQuery } from '../api/diagnostics';

export interface UseDiagnosticsTemperatureApps {
  data: DiagnosticsTemperatureAppsResponse | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  refresh: () => void;
}

/**
 * Fetch-on-enable + refetch-on-query-change for GET
 * /diagnostics/temperatures/apps, backing the per-bucket app breakdown shown
 * in the Cooling tab's temperature chart hover tooltip. Mirrors
 * useDiagnosticsTemperatures's query-driven refetch. Callers must pass a
 * `query` that only changes identity when hours/date actually change (e.g.
 * built with useMemo), since it drives the effect's dependency directly.
 */
export function useDiagnosticsTemperatureApps(enabled: boolean, query: DiagnosticsTemperatureQuery): UseDiagnosticsTemperatureApps {
  const [data, setData] = useState<DiagnosticsTemperatureAppsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const load = useCallback((q: DiagnosticsTemperatureQuery) => {
    setLoading(true);
    const seq = ++seqRef.current;
    void (async () => {
      const result = await fetchDiagnosticsTemperatureApps(q);
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
    if (enabled) load(query);
    else setLoading(false);
    return () => { mountedRef.current = false; };
  }, [enabled, query, load]);

  const refresh = useCallback(() => load(query), [load, query]);

  return { data, loading, error, mocked, refresh };
}
