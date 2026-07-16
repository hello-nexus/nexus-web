import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory, type MetricHistorySeries } from '../api/monitoringHistory';
import {
  initViewport,
  viewportReducer,
  type RangeKey,
  type ViewportState,
} from '../panel/widgets/monitoring/page/metricHistoryHelpers';

const DAY_MS = 24 * 3_600_000;
const SILHOUETTE_WINDOW_MS = 7 * DAY_MS;
const SILHOUETTE_MAX_POINTS = 600;
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
  /** Wide (7d) decimated series backing the TimelineBrush minimap. */
  silhouette: MetricHistorySeries[];
  /** Decimated series for the current visible window. */
  series: MetricHistorySeries[];
  /** The visible window - forces TimeSeriesChart's x-domain. */
  domain: [number, number];
  /** The TimelineBrush's full pannable domain. */
  fullDomain: [number, number];
  rangeKey: RangeKey;
  following: boolean;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
  retentionDays: number;
  setRange: (key: RangeKey) => void;
  onBrushChange: (from: number, to: number, phase: 'drag' | 'end') => void;
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
 * Owns the monitoring history chart's data: a wide 7d silhouette (for the
 * TimelineBrush minimap, refreshed every 60s), a decimated fetch for the
 * current visible window (debounced while the brush is being dragged,
 * immediate on release, fully re-decimated every 60s), and a 1s live-tail
 * poll that appends new points while following instead of re-decimating the
 * whole window. `seriesQuery` is the `series=` csv sent to the service - the
 * caller changes it to switch metrics (cpu/gpu/memory/network); the viewport
 * (from/to/rangeKey/following) is NOT reset by a seriesQuery change, so a
 * single persistent instance can swap metrics without losing the user's scrub
 * position. Seq-guarded like useDiagnosticsTemperatures - a stale response
 * for an outdated request is dropped.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);

  const [fetchEpoch, setFetchEpoch] = useState(0);
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

  const loadSilhouette = useCallback((query: string) => {
    const seq = ++silhouetteSeqRef.current;
    const now = nowRef.current;
    void (async () => {
      const result = await fetchMonitoringHistory({ from: now - SILHOUETTE_WINDOW_MS, to: now, maxPoints: SILHOUETTE_MAX_POINTS, series: query });
      if (!mountedRef.current || seq !== silhouetteSeqRef.current) return;
      if (result.data) {
        setSilhouette(result.data.series);
        setSupported(result.data.supported);
        setRetentionDays(result.data.retentionDays);
        setMocked(result.mocked);
        bumpNow(result.data.series);
      }
    })();
  }, [bumpNow]);

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
        const t = newestT(result.data.series);
        if (t !== null) lastLoadedTRef.current = t;
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, [bumpNow]);

  // Silhouette: fetch on mount, on a metric switch, and every 60s.
  useEffect(() => {
    if (!enabled) return;
    loadSilhouette(seriesQuery);
    const timer = window.setInterval(() => loadSilhouette(seriesQuery), SILHOUETTE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, seriesQuery, loadSilhouette]);

  // Viewport: fetch on mount, on a metric switch, and whenever the user (or
  // the 60s redecimate timer) requests a new window - NOT on every live tick
  // (that's the separate tail poll below). Debounces while the most recent
  // request was a brush drag; fires immediately otherwise.
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, seriesQuery, fetchEpoch, loadViewport]);

  // Full re-decimation every 60s, independent of following/dragging.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      lastPhaseRef.current = 'end';
      setFetchEpoch(e => e + 1);
    }, VIEWPORT_REDECIMATE_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  // Live tail: while following, poll just the new edge every second and
  // append rather than re-decimating the whole window.
  useEffect(() => {
    if (!enabled || !viewport.following) return;
    const timer = window.setInterval(() => {
      const requestNow = Date.now();
      const from = (lastLoadedTRef.current ?? requestNow - LIVE_TAIL_BOOTSTRAP_MS) + 1;
      const seq = ++tailSeqRef.current;
      void (async () => {
        const result = await fetchMonitoringHistory({ from, to: requestNow, maxPoints: LIVE_TAIL_MAX_POINTS, series: seriesQuery });
        if (!mountedRef.current || seq !== tailSeqRef.current || !result.data) return;
        const tail = result.data.series;
        const t = newestT(tail);
        if (t === null) return;
        setSeries(prev => mergeTail(prev, tail));
        bumpNow(tail);
        lastLoadedTRef.current = t;
      })();
    }, LIVE_TAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, viewport.following, seriesQuery, bumpNow]);

  const setRange = useCallback((key: RangeKey) => {
    lastPhaseRef.current = 'end';
    setViewport(prev => viewportReducer(prev, { type: 'setRange', key, now: nowRef.current }));
    setFetchEpoch(e => e + 1);
  }, []);

  const onBrushChange = useCallback((from: number, to: number, phase: 'drag' | 'end') => {
    lastPhaseRef.current = phase;
    setViewport(prev => viewportReducer(prev, { type: 'brushChange', from, to, now: nowRef.current }));
    setFetchEpoch(e => e + 1);
  }, []);

  const retry = useCallback(() => {
    lastPhaseRef.current = 'end';
    loadSilhouette(seriesQuery);
    setFetchEpoch(e => e + 1);
  }, [loadSilhouette, seriesQuery]);

  // Never lets the brush pan past what the server actually retains, even
  // when that's narrower than the 7d silhouette window (a fresh install).
  const fullDomainStart = nowRef.current - Math.min(SILHOUETTE_WINDOW_MS, retentionDays * DAY_MS);

  return {
    silhouette,
    series,
    domain: [viewport.from, viewport.to],
    fullDomain: [fullDomainStart, nowRef.current],
    rangeKey: viewport.rangeKey,
    following: viewport.following,
    loading,
    error,
    mocked,
    supported,
    retentionDays,
    setRange,
    onBrushChange,
    retry,
  };
}
