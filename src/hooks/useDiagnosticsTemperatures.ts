import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiagnosticsTemperatures, type DiagnosticsTemperaturesResponse } from '../api/diagnostics';

export interface UseDiagnosticsTemperatures {
  data: DiagnosticsTemperaturesResponse | null;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  refresh: () => void;
}

/**
 * Fetch-on-mount + refetch-on-range-change for GET /diagnostics/temperatures.
 * Separate from useDiagnosticsResource because the fetcher takes an `hours`
 * argument that changes at runtime (the Cooling tab's range picker) and must
 * retrigger the request, which the generic hook's mount-only effect doesn't do.
 */
export function useDiagnosticsTemperatures(enabled: boolean, hours: number): UseDiagnosticsTemperatures {
  const [data, setData] = useState<DiagnosticsTemperaturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const load = useCallback((h: number) => {
    setLoading(true);
    const seq = ++seqRef.current;
    void (async () => {
      const result = await fetchDiagnosticsTemperatures(h);
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
    if (enabled) load(hours);
    else setLoading(false);
    return () => { mountedRef.current = false; };
  }, [enabled, hours, load]);

  const refresh = useCallback(() => load(hours), [load, hours]);

  return { data, loading, error, mocked, refresh };
}
