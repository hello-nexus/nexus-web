import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistoryApps, type AppWindowSeries } from '../api/monitoringHistoryApps';
import { fillAppGaps } from '../panel/widgets/monitoring/page/appWindowHelpers';

const VIEWPORT_DEBOUNCE_MS = 200;
const LIVE_REFRESH_MS = 5_000;
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
 *
 * `process` scopes every fetch to one named app (the process-detail
 * slideout's own per-metric usage tiles, see useProcessDetailUsage) - a
 * change in `process` is treated the same as a metric switch (bypasses the
 * tick-slide skip, drops `ready` until the new response lands).
 */
export function useMetricHistoryApps(enabled: boolean, seriesParam: string, from: number, to: number, following: boolean, process?: string): UseMetricHistoryAppsResult {
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
  const prevProcessRef = useRef<string | undefined>(undefined);
  // Tracks whether the debounced-fetch effect below ran while enabled last
  // time - the disabling effect above clears `apps` to [] while disabled, so
  // re-enabling with an otherwise-unchanged width/series/process must still
  // fetch rather than read as a tick slide (prevWidthRef etc. are frozen,
  // not reset, while disabled - see the effect below).
  const prevEnabledRef = useRef(false);

  useEffect(() => { fromRef.current = from; toRef.current = to; }, [from, to]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Disabling (e.g. a GPU tab with no resolved adapterLuid yet) or an empty
  // seriesParam must not leave the previous metric's apps rendering - the
  // debounced-fetch effect below only runs while enabled with a real
  // series, so nothing else would clear this.
  useEffect(() => {
    if (enabled && seriesParam !== '') return;
    setApps([]);
    setReady(false);
  }, [enabled, seriesParam]);

  const load = useCallback((loadFrom: number, loadTo: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    void (async () => {
      // No maxApps: the full process list (search filters it client-side,
      // see ProcessListSection) - a client-requested cap on a top-N-by-usage
      // feed is exactly what causes borderline apps to churn in and out of
      // membership between ticks.
      const result = await fetchMonitoringHistoryApps({
        from: loadFrom, to: loadTo, series: seriesParam, process, maxPoints: MAX_POINTS,
      });
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (result.data) {
        // Gap-fill once per response (item 52), not per render/frame - every
        // consumer of `apps` (the row sparklines, the hover tooltip, and the
        // process-detail slideout's mini chart) then reads already-filled
        // points.
        setApps(result.data.apps.map(app => ({ ...app, points: fillAppGaps(app.points) })));
        setSupported(result.data.supported);
        setMocked(result.mocked);
        setReady(true);
      } else if (result.unsupported) {
        setSupported(false);
      }
      setLoading(false);
    })();
  }, [seriesParam, process]);

  // Debounced fetch on a real viewport change (width changed, the window
  // moved while detached, or the metric itself switched). A live tick alone
  // - following, same width, same series - is left to the slow poll below
  // instead of firing on every tick. The series check matters because a
  // metric switch while following (e.g. cpu -> gpu) does NOT reset the
  // shared box, so width alone would misclassify it as a tick slide and
  // leave the previous metric's apps showing. Re-enabling after a disabled
  // stretch also bypasses the tick-slide check even when width/series/
  // process all come back unchanged (e.g. switching tabs away and back with
  // the same process selected) - disabling cleared `apps` to [] above, so a
  // skipped fetch here would leave it empty until the slow poll's own
  // interval next fires.
  useEffect(() => {
    if (!enabled || !supported || seriesParam === '') {
      prevEnabledRef.current = false;
      return;
    }
    const width = to - from;
    const justEnabled = !prevEnabledRef.current;
    const seriesChanged = (prevSeriesParamRef.current !== null && prevSeriesParamRef.current !== seriesParam)
      || prevProcessRef.current !== process;
    const isTickSlide = !justEnabled && following && !seriesChanged
      && prevWidthRef.current !== null && Math.abs(width - prevWidthRef.current) < 1;
    prevEnabledRef.current = true;
    prevWidthRef.current = width;
    prevSeriesParamRef.current = seriesParam;
    prevProcessRef.current = process;
    if (seriesChanged) setReady(false);
    if (isTickSlide) return;
    const timer = window.setTimeout(() => load(from, to), VIEWPORT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, supported, from, to, following, load, seriesParam, process]);

  // Slow live-refresh while following, independent of the per-tick from/to
  // slide above - reads from/to via refs so it always uses the latest
  // window without retriggering the interval itself.
  useEffect(() => {
    if (!enabled || !supported || !following || seriesParam === '') return;
    const timer = window.setInterval(() => load(fromRef.current, toRef.current), LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, supported, following, load, seriesParam]);

  return { apps, loading, supported, mocked, ready };
}
