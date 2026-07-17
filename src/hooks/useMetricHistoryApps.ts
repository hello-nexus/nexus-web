import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistoryApps, type AppWindowSeries } from '../api/monitoringHistoryApps';

const VIEWPORT_DEBOUNCE_MS = 200;
const LIVE_REFRESH_MS = 5_000;
const MAX_APPS = 15;
const MAX_POINTS = 100;

export interface UseMetricHistoryAppsResult {
  apps: AppWindowSeries[];
  loading: boolean;
  supported: boolean;
  mocked: boolean;
  /** True once a response has landed for the current metric - false right
   *  after mount or a metric switch, before its first fetch resolves, so a
   *  caller can keep showing its own fallback data instead of an empty
   *  `apps` list for that gap. */
  ready: boolean;
}

/**
 * Window-scoped per-app data for the current chart window: feeds the
 * process list's row values/sparklines and the hero chart's hover tooltip
 * (which reads it client-side, see appWindowHelpers.nearestAppValueAt - no
 * per-hover fetching). One debounced fetch per real viewport change (a
 * preset pick, a drag, a chart drag-select); while following, a live tick
 * merely sliding the window does NOT retrigger this on every tick - a
 * slower periodic poll keeps the data fresh instead, since per-app windows
 * don't need the box's own tail-poll precision.
 */
export function useMetricHistoryApps(enabled: boolean, seriesParam: string, from: number, to: number, following: boolean): UseMetricHistoryAppsResult {
  const [apps, setApps] = useState<AppWindowSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [mocked, setMocked] = useState(false);
  const [ready, setReady] = useState(false);

  const mountedRef = useRef(true);
  const seqRef = useRef(0);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  const prevWidthRef = useRef<number | null>(null);
  const prevSeriesParamRef = useRef<string | null>(null);

  useEffect(() => { fromRef.current = from; toRef.current = to; }, [from, to]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((loadFrom: number, loadTo: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    void (async () => {
      const result = await fetchMonitoringHistoryApps({
        from: loadFrom, to: loadTo, series: seriesParam, maxApps: MAX_APPS, maxPoints: MAX_POINTS,
      });
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (result.data) {
        setApps(result.data.apps);
        setSupported(result.data.supported);
        setMocked(result.mocked);
        setReady(true);
      } else if (result.unsupported) {
        setSupported(false);
      }
      setLoading(false);
    })();
  }, [seriesParam]);

  // Debounced fetch on a real viewport change (width changed, the window
  // moved while detached, or the metric itself switched). A live tick alone
  // - following, same width, same series - is left to the slow poll below
  // instead of firing on every tick. The series check matters because a
  // metric switch while following (e.g. cpu -> gpu) does NOT reset the
  // shared box, so width alone would misclassify it as a tick slide and
  // leave the previous metric's apps showing.
  useEffect(() => {
    if (!enabled || !supported) return;
    const width = to - from;
    const seriesChanged = prevSeriesParamRef.current !== null && prevSeriesParamRef.current !== seriesParam;
    const isTickSlide = following && !seriesChanged && prevWidthRef.current !== null && Math.abs(width - prevWidthRef.current) < 1;
    prevWidthRef.current = width;
    prevSeriesParamRef.current = seriesParam;
    if (seriesChanged) setReady(false);
    if (isTickSlide) return;
    const timer = window.setTimeout(() => load(from, to), VIEWPORT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, supported, from, to, following, load, seriesParam]);

  // Slow live-refresh while following, independent of the per-tick from/to
  // slide above - reads from/to via refs so it always uses the latest
  // window without retriggering the interval itself.
  useEffect(() => {
    if (!enabled || !supported || !following) return;
    const timer = window.setInterval(() => load(fromRef.current, toRef.current), LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, supported, following, load]);

  return { apps, loading, supported, mocked, ready };
}
