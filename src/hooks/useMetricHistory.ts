import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory, type MetricHistorySeries } from '../api/monitoringHistory';
import {
  initViewport,
  viewportReducer,
  type PresetKey,
  type RangeKey,
  type ViewportState,
} from '../panel/widgets/monitoring/page/metricHistoryHelpers';

const DAY_MS = 24 * 3_600_000;
const SILHOUETTE_MAX_POINTS = 400;
const SILHOUETTE_REFRESH_MS = 60_000;

const VIEWPORT_MAX_POINTS = 800;
const VIEWPORT_DEBOUNCE_MS = 200;
const VIEWPORT_REDECIMATE_MS = 60_000;

const LIVE_TAIL_POLL_MS = 1_000;
const LIVE_TAIL_MAX_POINTS = 50;
// Fallback lookback for the very first tail poll (before any viewport
// response has reported a newest point).
const LIVE_TAIL_BOOTSTRAP_MS = 5_000;

export interface UseMetricHistoryResult {
  /** Decimated series over the current seek-bar STRIP - backs the
   *  TimelineBrush minimap. */
  silhouette: MetricHistorySeries[];
  /** Decimated series for the current chart window (the "box"). */
  series: MetricHistorySeries[];
  /** The chart window - forces TimeSeriesChart's x-domain. */
  domain: [number, number];
  /** The seek-bar strip's own span - TimelineBrush's track bounds. */
  stripDomain: [number, number];
  rangeKey: RangeKey;
  /** The last non-custom preset - drives the range control's reset-to-preset
   *  affordance once rangeKey goes 'custom'. */
  lastPresetKey: PresetKey;
  following: boolean;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
  retentionDays: number;
  setRange: (key: PresetKey) => void;
  /** Dragging/resizing the TimelineBrush box within the strip - moves the
   *  chart window only; the strip (and rangeKey) is untouched. */
  onBrushChange: (from: number, to: number, phase: 'drag' | 'end') => void;
  /** A drag-select directly on the hero chart - sets the chart window to the
   *  exact selection and re-derives a strip around it, going 'custom'. */
  onChartDragSelect: (from: number, to: number) => void;
  /** Re-anchors both the box and the strip to now, keeping their current
   *  widths and rangeKey. */
  backToLive: () => void;
  retry: () => void;
}

function newestT(seriesList: readonly MetricHistorySeries[]): number | null {
  let t: number | null = null;
  for (const s of seriesList) {
    for (const p of s.points) {
      if (t === null || p.t > t) t = p.t;
    }
  }
  return t;
}

/** Appends newly polled tail points onto the matching existing series (by
 *  id), de-duplicated by timestamp. A tail id with no existing entry yet
 *  (the initial viewport had no data for it, or the metric just switched) is
 *  added outright. */
function mergeTail(prev: readonly MetricHistorySeries[], tail: readonly MetricHistorySeries[]): MetricHistorySeries[] {
  const prevById = new Map(prev.map(s => [s.id, s]));
  const merged = prev.map(s => {
    const t = tail.find(x => x.id === s.id);
    if (!t || t.points.length === 0) return s;
    const seenT = new Set(s.points.map(p => p.t));
    const additions = t.points.filter(p => !seenT.has(p.t));
    if (additions.length === 0) return s;
    return { ...s, points: [...s.points, ...additions] };
  });
  const added = tail.filter(t => !prevById.has(t.id) && t.points.length > 0);
  return [...merged, ...added];
}

/**
 * Owns the monitoring history chart's data: a decimated silhouette over the
 * current seek-bar STRIP (for the TimelineBrush minimap, refetched whenever
 * the strip itself changes and refreshed periodically while following), a
 * decimated fetch for the current chart-window BOX (debounced while the
 * brush is being dragged, immediate on release, fully re-decimated on the
 * same periodic timer), and a live-tail poll that appends new points to the
 * box while following instead of re-decimating the whole window.
 * `seriesQuery` is the `series=` csv sent to the service - the caller
 * changes it to switch metrics (cpu/gpu/memory/network); the viewport
 * (box/strip/rangeKey/following) is NOT reset by a seriesQuery change, so a
 * single persistent instance can swap metrics without losing the user's
 * scrub position. Seq-guarded like useDiagnosticsTemperatures - a stale
 * response for an outdated request is dropped.
 */
export function useMetricHistory(enabled: boolean, seriesQuery: string): UseMetricHistoryResult {
  // Bootstrapped from the client clock once (the lazy useState initializer
  // runs exactly once, unlike useRef's eager argument), purely to shape the
  // very first request window; every value used for chart time after that is
  // derived from the newest `t` a response actually returned (monotonic
  // guard below).
  const [bootstrapNow] = useState(() => Date.now());
  const nowRef = useRef(bootstrapNow);
  const [viewport, setViewport] = useState<ViewportState>(() => initViewport(nowRef.current));
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const [silhouette, setSilhouette] = useState<MetricHistorySeries[]>([]);
  const [series, setSeries] = useState<MetricHistorySeries[]>([]);
  const [supported, setSupported] = useState(true);
  const [retentionDays, setRetentionDays] = useState(7);
  const retentionDaysRef = useRef(retentionDays);
  useEffect(() => { retentionDaysRef.current = retentionDays; }, [retentionDays]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);

  const [fetchEpoch, setFetchEpoch] = useState(0);
  const [stripEpoch, setStripEpoch] = useState(0);
  const lastPhaseRef = useRef<'drag' | 'end'>('end');
  const mountedRef = useRef(true);
  const silhouetteSeqRef = useRef(0);
  const viewportSeqRef = useRef(0);
  const tailSeqRef = useRef(0);
  const lastLoadedTRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const bumpNow = useCallback((seriesList: readonly MetricHistorySeries[]) => {
    const t = newestT(seriesList);
    if (t !== null && t > nowRef.current) {
      nowRef.current = t;
      setViewport(prev => viewportReducer(prev, { type: 'tick', now: t }));
    }
  }, []);

  // Clamps the strip (and box) to the just-learned retention window whenever
  // a response reports retentionDays - a preset picked (or defaulted) before
  // the real value was known can otherwise leave the strip's start past what
  // the server actually retains.
  const clampToRetention = useCallback((days: number) => {
    setViewport(prev => viewportReducer(prev, { type: 'retentionClamp', retentionMs: days * DAY_MS, now: nowRef.current }));
  }, []);

  const loadSilhouette = useCallback((from: number, to: number, query: string) => {
    const seq = ++silhouetteSeqRef.current;
    void (async () => {
      const result = await fetchMonitoringHistory({ from, to, maxPoints: SILHOUETTE_MAX_POINTS, series: query });
      if (!mountedRef.current || seq !== silhouetteSeqRef.current) return;
      if (result.data) {
        setSilhouette(result.data.series);
        setSupported(result.data.supported);
        setRetentionDays(result.data.retentionDays);
        setMocked(result.mocked);
        setError(false);
        bumpNow(result.data.series);
        clampToRetention(result.data.retentionDays);
      } else if (result.unsupported) {
        setSupported(false);
      } else {
        setError(true);
      }
    })();
  }, [bumpNow, clampToRetention]);

  const loadViewport = useCallback((from: number, to: number, query: string) => {
    const seq = ++viewportSeqRef.current;
    setLoading(true);
    void (async () => {
      const result = await fetchMonitoringHistory({ from, to, maxPoints: VIEWPORT_MAX_POINTS, series: query });
      if (!mountedRef.current || seq !== viewportSeqRef.current) return;
      if (result.data) {
        setSeries(result.data.series);
        setSupported(result.data.supported);
        setRetentionDays(result.data.retentionDays);
        setMocked(result.mocked);
        setError(false);
        bumpNow(result.data.series);
        clampToRetention(result.data.retentionDays);
        // Invalidates any tail request still in flight from before this
        // viewport refresh landed - its response could resolve after and,
        // absent this, regress lastLoadedTRef past the point this fetch just
        // established (the seq guard below then drops it).
        tailSeqRef.current++;
        const t = newestT(result.data.series);
        if (t !== null && t > (lastLoadedTRef.current ?? -Infinity)) lastLoadedTRef.current = t;
      } else if (result.unsupported) {
        setSupported(false);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, [bumpNow, clampToRetention]);

  // Silhouette: fetch over the strip's current bounds on mount, on a metric
  // switch, and whenever the strip itself changes (setRange/chartDragSelect/
  // backToLive bump stripEpoch - a pure box pan/resize within an unchanged
  // strip does not). Stops polling once the route is known unsupported or
  // the last fetch errored, so a service without the route (or one that's
  // unreachable) isn't polled forever - retry() re-arms it explicitly.
  useEffect(() => {
    if (!enabled || !supported || error) return;
    const { stripFrom, stripTo } = viewportRef.current;
    loadSilhouette(stripFrom, stripTo, seriesQuery);
    // stripEpoch is the trigger; stripFrom/stripTo above are read from the
    // ref at fire time, same as the viewport (box) fetch effect below.
  }, [enabled, seriesQuery, stripEpoch, loadSilhouette, supported, error]);

  // Keeps the silhouette fresh while following, independent of stripEpoch
  // (the strip itself slides every tick, but re-fetching that often would be
  // wasteful - this refreshes on the same cadence the old fixed-window
  // design used).
  useEffect(() => {
    if (!enabled || !supported || error || !viewport.following) return;
    const timer = window.setInterval(() => {
      const { stripFrom, stripTo } = viewportRef.current;
      loadSilhouette(stripFrom, stripTo, seriesQuery);
    }, SILHOUETTE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, seriesQuery, loadSilhouette, supported, error, viewport.following]);

  // Viewport (box): fetch on mount, on a metric switch, and whenever the
  // user (or the redecimate timer) requests a new window - NOT on every live
  // tick (that's the separate tail poll below). Debounces while the most
  // recent request was a brush drag; fires immediately otherwise. Gated on
  // `supported` (not `error`, unlike the other effects) - a metric switch
  // must still be able to retry after a transient failure, but once the
  // route is confirmed unsupported every series is equally unreachable, so a
  // metric switch must not fire another single-shot 404.
  useEffect(() => {
    if (!enabled || !supported) return;
    const delay = lastPhaseRef.current === 'drag' ? VIEWPORT_DEBOUNCE_MS : 0;
    // from/to are read from the ref inside the callback (fired later), not
    // captured now - a live tick that lands during the debounce window still
    // slides the viewport, and this fetch must use that fresher window
    // rather than a stale snapshot from when the timer was scheduled.
    const timer = window.setTimeout(() => {
      const { from, to } = viewportRef.current;
      loadViewport(from, to, seriesQuery);
    }, delay);
    return () => window.clearTimeout(timer);
    // fetchEpoch is the trigger for user/timer-driven refetches; a live tick
    // alone never retriggers this (see the ref read above).
  }, [enabled, seriesQuery, fetchEpoch, loadViewport, supported]);

  // Full re-decimation on a timer, independent of following/dragging. Same
  // supported/error gate as the silhouette poll above.
  useEffect(() => {
    if (!enabled || !supported || error) return;
    const timer = window.setInterval(() => {
      lastPhaseRef.current = 'end';
      setFetchEpoch(e => e + 1);
    }, VIEWPORT_REDECIMATE_MS);
    return () => window.clearInterval(timer);
  }, [enabled, supported, error]);

  // Live tail: poll just the new edge every second REGARDLESS of following -
  // this is what keeps nowRef (the server time base) advancing while the
  // user browses a detached historical window, so backToLive() and a brush
  // drag back to the live edge re-anchor to the actual current time rather
  // than whatever moment the user happened to detach at (nowRef would
  // otherwise freeze the instant following goes false, since the box's own
  // fetches keep re-requesting the same static historical window and never
  // observe a newer point). The DISPLAYED series only merges the tail while
  // following (read from viewportRef, not the effect's own closed-over
  // `viewport`, so this doesn't need following in its dependency array and
  // therefore doesn't tear the interval down and rebuild it on every
  // attach/detach) - a detached scrub must never have its history mutated
  // out from under it. `to` is anchored to the server time base
  // (lastLoadedTRef, or nowRef before any response has landed) rather than
  // the client clock - a client/relay clock skew against the client's
  // Date.now() could otherwise request a window where from > to and freeze
  // the tail.
  useEffect(() => {
    if (!enabled || !supported || error) return;
    const timer = window.setInterval(() => {
      const base = lastLoadedTRef.current ?? nowRef.current;
      const to = base + LIVE_TAIL_POLL_MS * 2;
      const from = (lastLoadedTRef.current ?? base - LIVE_TAIL_BOOTSTRAP_MS) + 1;
      const seq = ++tailSeqRef.current;
      void (async () => {
        const result = await fetchMonitoringHistory({ from, to, maxPoints: LIVE_TAIL_MAX_POINTS, series: seriesQuery });
        if (!mountedRef.current || seq !== tailSeqRef.current || !result.data) return;
        const tail = result.data.series;
        const t = newestT(tail);
        if (t === null) return;
        if (viewportRef.current.following) setSeries(prev => mergeTail(prev, tail));
        bumpNow(tail);
        if (t > (lastLoadedTRef.current ?? -Infinity)) lastLoadedTRef.current = t;
      })();
    }, LIVE_TAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, seriesQuery, bumpNow, supported, error]);

  const setRange = useCallback((key: PresetKey) => {
    lastPhaseRef.current = 'end';
    setViewport(prev => {
      const next = viewportReducer(prev, { type: 'setRange', key, now: nowRef.current });
      // A wide preset (e.g. 7d) picked on a shorter-retention install must
      // not leave the strip past what the server actually keeps.
      return viewportReducer(next, { type: 'retentionClamp', retentionMs: retentionDaysRef.current * DAY_MS, now: nowRef.current });
    });
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
  }, []);

  const onBrushChange = useCallback((from: number, to: number, phase: 'drag' | 'end') => {
    lastPhaseRef.current = phase;
    setViewport(prev => viewportReducer(prev, { type: 'brushChange', from, to, now: nowRef.current }));
    setFetchEpoch(e => e + 1);
  }, []);

  const onChartDragSelect = useCallback((from: number, to: number) => {
    lastPhaseRef.current = 'end';
    setViewport(prev => viewportReducer(prev, {
      type: 'chartDragSelect', from, to, now: nowRef.current, retentionMs: retentionDaysRef.current * DAY_MS,
    }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
  }, []);

  const backToLive = useCallback(() => {
    lastPhaseRef.current = 'end';
    setViewport(prev => viewportReducer(prev, { type: 'backToLive', now: nowRef.current }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
  }, []);

  // Resetting error/supported (rather than calling loadSilhouette directly)
  // re-arms the gated silhouette-poll effect above, which fires its own
  // fetch on this re-run (supported/error are already in its deps) -
  // calling loadSilhouette here too would double it.
  const retry = useCallback(() => {
    lastPhaseRef.current = 'end';
    setSupported(true);
    setError(false);
    setFetchEpoch(e => e + 1);
  }, []);

  return {
    silhouette,
    series,
    domain: [viewport.from, viewport.to],
    stripDomain: [viewport.stripFrom, viewport.stripTo],
    rangeKey: viewport.rangeKey,
    lastPresetKey: viewport.lastPresetKey,
    following: viewport.following,
    loading,
    error,
    mocked,
    supported,
    retentionDays,
    setRange,
    onBrushChange,
    onChartDragSelect,
    backToLive,
    retry,
  };
}
