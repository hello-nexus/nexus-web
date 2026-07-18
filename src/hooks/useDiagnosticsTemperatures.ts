import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiagnosticsTemperatures, type DiagnosticsTemperatureQuery, type DiagnosticsTemperaturesResponse } from '../api/diagnostics';

export interface UseDiagnosticsTemperatures {
  data: DiagnosticsTemperaturesResponse | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  refresh: () => void;
}

/**
 * Fetch-on-mount + refetch-on-query-change for GET /diagnostics/temperatures.
 * Separate from useDiagnosticsResource because the fetcher takes a `query`
 * (hours or a single day) that can change at runtime and must retrigger the
 * request, which the generic hook's mount-only effect doesn't do. Callers
 * must pass a `query` that only changes identity when hours/date actually
 * change (e.g. a module-level constant, or built with useMemo), since it
 * drives the effect's dependency directly.
 */
export function useDiagnosticsTemperatures(enabled: boolean, query: DiagnosticsTemperatureQuery): UseDiagnosticsTemperatures {
  const [data, setData] = useState<DiagnosticsTemperaturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const load = useCallback((q: DiagnosticsTemperatureQuery) => {
    setLoading(true);
    const seq = ++seqRef.current;
    void (async () => {
      const result = await fetchDiagnosticsTemperatures(q);
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
