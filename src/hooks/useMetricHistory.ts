import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory, type MetricHistorySeries } from '../api/monitoringHistory';
import { MonitoringHistoryCache, sliceToWindow } from '../lib/monitoringHistoryCache';
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
const VIEWPORT_REDECIMATE_MS = 60_000;

// Trailing debounce for a during-drag fine refetch (see fetchDragFine) -
// resets on every 'drag' event, so a continuous scrub never fetches; only a
// pause at least this long lets it through, upgrading the panned view to
// freshly fetched fine data in place.
const DRAG_FINE_REFRESH_MS = 180;

const LIVE_TAIL_POLL_MS = 1_000;
const LIVE_TAIL_MAX_POINTS = 50;
// Fallback lookback for the very first tail poll (before any viewport
// response has reported a newest point).
const LIVE_TAIL_BOOTSTRAP_MS = 5_000;

// A viewport left unchanged for this long warms the cache for the
// immediately adjacent (same-width) windows, so a subsequent pan in either
// direction can render instantly from cache instead of paying a full
// round trip. Comfortably longer than LIVE_TAIL_POLL_MS so it never fires
// mid-tick while the user is still actively watching a fresh window settle.
const PREFETCH_IDLE_MS = 3_000;

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
  /** True while a TimelineBrush box drag is in progress (between a 'drag'
   *  event and its matching 'end') - `series` is a pan/clip of the fine
   *  snapshot for the whole gesture (see renderFinePanSlice), so its own
   *  visible min/max still shifts tick to tick as the window moves across
   *  real data; a consumer that needs to avoid recomputing a derived value
   *  off that per-tick shift (e.g. the adaptive Y axis) can freeze on this
   *  instead. */
  dragging: boolean;
  loading: boolean;
  error: boolean;
  mocked: boolean;
  supported: boolean;
  retentionDays: number;
  /** The current chart window's actual point spacing in seconds, as reported
   *  by the most recent viewport response - null before the first response
   *  lands. Drives the hover tooltip's time-label granularity (seconds
   *  appear once the effective step is sub-minute). */
  stepSeconds: number | null;
  /** Bumped only by an explicit navigation action - setRange, onBrushChange,
   *  onChartDragSelect, backToLive, or retry. NOT bumped by a live-follow
   *  tick sliding the same window, nor by the periodic silhouette/viewport
   *  redecimation timers refreshing the same window in place. A caller that
   *  needs to know "the window the user is looking at meaningfully changed"
   *  (e.g. the process list's rank-stability reset trigger) reads this
   *  instead of `domain`, whose reference changes every following tick, or
   *  the internal fetch-retry counter, which also changes on a routine
   *  refresh. */
  viewportGeneration: number;
  setRange: (key: PresetKey) => void;
  /** Dragging/resizing the TimelineBrush box within the strip - moves the
   *  chart window only; the strip (and rangeKey) is untouched. */
  onBrushChange: (from: number, to: number, phase: 'drag' | 'end') => void;
  /** A drag-select directly on the hero chart - sets the chart window to the
   *  exact selection and re-derives a strip around it, going 'custom'. */
  onChartDragSelect: (from: number, to: number) => void;
  /** Stops the live edge from advancing (following goes false) without
   *  otherwise touching the box/strip - a plain chart click's own detach,
   *  the same live/scrubbed transition a TimelineBrush drag off the live
   *  edge already makes via onBrushChange. */
  detach: () => void;
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

// The time span (max t - min t, pooled across every series) a drag-panned
// slice must cover, as a fraction of the requested window's own width,
// before renderFinePanSlice trusts it over the coarser silhouette fallback.
const FINE_PAN_MIN_COVERAGE = 0.5;

function coveredSpanMs(seriesList: readonly MetricHistorySeries[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const s of seriesList) {
    for (const p of s.points) {
      if (p.t < min) min = p.t;
      if (p.t > max) max = p.t;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
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
 * decimated fetch for the current chart-window BOX (its own periodic/
 * on-navigation fetch is withheld entirely while the brush is being dragged,
 * firing immediately on release, fully re-decimated on the same periodic
 * timer - a SEPARATE debounced fetch upgrades the box mid-drag instead, see
 * fetchDragFine), and a live-tail poll that appends new points to the box
 * while following instead of re-decimating the whole window.
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
  const seriesQueryRef = useRef(seriesQuery);
  useEffect(() => { seriesQueryRef.current = seriesQuery; }, [seriesQuery]);

  const [silhouette, setSilhouette] = useState<MetricHistorySeries[]>([]);
  const [series, setSeries] = useState<MetricHistorySeries[]>([]);
  const [supported, setSupported] = useState(true);
  const [retentionDays, setRetentionDays] = useState(7);
  const retentionDaysRef = useRef(retentionDays);
  useEffect(() => { retentionDaysRef.current = retentionDays; }, [retentionDays]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mocked, setMocked] = useState(false);
  const [stepSeconds, setStepSeconds] = useState<number | null>(null);
  // True only between a TimelineBrush 'drag' event and its matching 'end' -
  // consumers (the adaptive Y axis) freeze on this to avoid recomputing from
  // the visible window's own per-tick shift during the pan.
  const [dragging, setDragging] = useState(false);

  const [fetchEpoch, setFetchEpoch] = useState(0);
  const [stripEpoch, setStripEpoch] = useState(0);
  const [viewportGeneration, setViewportGeneration] = useState(0);
  const lastPhaseRef = useRef<'drag' | 'end'>('end');
  const mountedRef = useRef(true);
  const silhouetteSeqRef = useRef(0);
  const viewportSeqRef = useRef(0);
  const tailSeqRef = useRef(0);
  const lastLoadedTRef = useRef<number | null>(null);
  const cacheRef = useRef(new MonitoringHistoryCache());
  const silhouetteRef = useRef(silhouette);
  useEffect(() => { silhouetteRef.current = silhouette; }, [silhouette]);
  // The most recent fine viewport fetch's own series - a drag pans/clips
  // this snapshot instead of fetching anything new per pointer move (see
  // renderFinePanSlice below), so it stays untouched by a drag's own
  // per-tick renders. It advances from a real network response (the
  // settled on-release fetch, a live-tail merge, or fetchDragFine's
  // debounced during-drag refresh) - never from the drag's own renders.
  const fineSnapshotRef = useRef<MetricHistorySeries[]>([]);
  // Pending fetchDragFine debounce timer - reset on every 'drag' event,
  // cleared wherever the drag phase is force-ended (see clearDragFineTimer
  // below) and on unmount.
  const dragFineTimerRef = useRef<number | null>(null);

  // Cancels the pending debounce timer - called by every path that
  // force-ends the drag phase (onBrushChange's own 'end', setRange,
  // onChartDragSelect, backToLive, retry, the error/unsupported reset
  // effect below) and on unmount, so a pause-triggered fetch never fires
  // for a drag the user (or a background failure) has already left.
  const clearDragFineTimer = useCallback(() => {
    if (dragFineTimerRef.current !== null) {
      window.clearTimeout(dragFineTimerRef.current);
      dragFineTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Guards a hook instance whose own unmount lands mid-drag (rather
      // than the render-branch-swap case below, which the hook itself
      // survives) against leaving the ref stuck for any in-flight closure
      // still holding it.
      lastPhaseRef.current = 'end';
      clearDragFineTimer();
    };
  }, [clearDragFineTimer]);

  // TimelineBrush can unmount without ever emitting its own 'end' event:
  // MetricHistorySection swaps to its <EmptyState> message box on `error`
  // and once `supported` goes false (no retry affordance exists for the
  // latter case). This hook instance persists across both (and across a
  // metric switch, since seriesQuery alone doesn't reset the viewport) -
  // left alone, lastPhaseRef and `dragging` would stay
  // stuck on 'drag' indefinitely: permanently gating off the fine viewport
  // fetch and the redecimate timer below, and freezing
  // MetricHistorySection's drag-stable Y-axis ref, even once a later fetch
  // recovers on its own. Reset both here so recovery doesn't depend on the
  // brush itself reaching a matching 'end'; also cancels any pending
  // debounce timer so a paused drag's fetch doesn't fire after the fact.
  useEffect(() => {
    if (error || !supported) {
      lastPhaseRef.current = 'end';
      setDragging(false);
      clearDragFineTimer();
    }
  }, [error, supported, clearDragFineTimer]);

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

  // Renders the already-loaded silhouette (the strip's own coarse
  // decimation over its FULL span) sliced to [from, to] - always available
  // once the strip's silhouette has loaded, and always spans the entire
  // requested window (never a partial sliver), so this is the one interim
  // source that can never collapse to a near-empty render. Also the
  // fallback source for renderFinePanSlice below, when the fine snapshot
  // has no coverage at all for the requested window.
  const renderSilhouetteSlice = useCallback((from: number, to: number) => {
    if (silhouetteRef.current.length === 0) return;
    const sliced = sliceToWindow(
      { supported: true, retentionDays: retentionDaysRef.current, stepSeconds: 0, series: silhouetteRef.current },
      from, to,
    );
    setSeries(sliced.series);
  }, []);

  // Synchronous (no network) interim render for a requested [from, to]
  // window, used for a settled navigation (loadViewport, before its own
  // fetch resolves): an exact cache hit renders immediately; a miss falls
  // back to whatever cached window overlaps this one, sliced to the
  // requested range; a further miss falls back to the silhouette slice
  // above. NOT used while actively dragging - see renderFinePanSlice below,
  // the dedicated drag-time renderer.
  const renderFromCacheOrSilhouette = useCallback((from: number, to: number, query: string) => {
    const exact = cacheRef.current.get(from, to, VIEWPORT_MAX_POINTS, query);
    if (exact) {
      setSeries(exact.data.series);
      setStepSeconds(exact.data.stepSeconds);
      return;
    }
    const overlap = cacheRef.current.findOverlapping(from, to, query);
    if (overlap) {
      setSeries(sliceToWindow(overlap.data, from, to).series);
      setStepSeconds(overlap.data.stepSeconds);
      return;
    }
    renderSilhouetteSlice(from, to);
  }, [renderSilhouetteSlice]);

  // The sole synchronous render used while an active TimelineBrush drag is
  // in progress (see onBrushChange): pans/clips the last fine fetch
  // (fineSnapshotRef - untouched by the drag's own per-tick renders, but
  // refreshed in place by fetchDragFine's debounced during-drag refetch
  // below, the settled on-release fetch, or a live-tail merge) to the
  // moving window, so the chart reads as real data shifting rather than a
  // coarse approximation. Falls back to the silhouette slice once the
  // snapshot's own overlap with the requested window drops below
  // FINE_PAN_MIN_COVERAGE - not just when it's entirely empty - so a drag
  // that pans mostly (but not fully) off the snapshot's edge doesn't render
  // an almost-empty sliver of real data (the same "near-empty spike"
  // failure mode this rework replaces, just sourced from a stale edge
  // instead of a stale fetch).
  const renderFinePanSlice = useCallback((from: number, to: number) => {
    const sliced = sliceToWindow(
      { supported: true, retentionDays: retentionDaysRef.current, stepSeconds: 0, series: fineSnapshotRef.current },
      from, to,
    );
    const requestedSpan = to - from || 1;
    if (coveredSpanMs(sliced.series) >= requestedSpan * FINE_PAN_MIN_COVERAGE) {
      setSeries(sliced.series);
    } else {
      renderSilhouetteSlice(from, to);
    }
  }, [renderSilhouetteSlice]);

  // Debounced (DRAG_FINE_REFRESH_MS) full-resolution fetch for the CURRENT
  // window while a drag is paused but not yet released - see
  // scheduleDragFineRefresh in onBrushChange, which resets this on every
  // 'drag' event so a continuous scrub never fetches. Reads from/to and the
  // series query from refs (fired later than scheduled, same convention as
  // the viewport-fetch effect below), and shares viewportSeqRef with
  // loadViewport so a response superseded by a newer fetch of either kind is
  // dropped. On success this is the only place besides loadViewport and the
  // live-tail merge that advances fineSnapshotRef, so a subsequent
  // renderFinePanSlice pans real fine data for the paused region instead of
  // falling back to the coarse silhouette. Silent on failure/unsupported -
  // the drag pan simply keeps rendering off whatever snapshot it already
  // has, never flipping the whole chart to the error state mid-scrub.
  const fetchDragFine = useCallback(() => {
    const { from, to } = viewportRef.current;
    const query = seriesQueryRef.current;
    const seq = ++viewportSeqRef.current;
    void (async () => {
      const result = await fetchMonitoringHistory({ from, to, maxPoints: VIEWPORT_MAX_POINTS, series: query });
      if (!mountedRef.current || seq !== viewportSeqRef.current || !result.data) return;
      fineSnapshotRef.current = result.data.series;
      if (!result.mocked) cacheRef.current.set(from, to, VIEWPORT_MAX_POINTS, query, result.data);
      renderFinePanSlice(viewportRef.current.from, viewportRef.current.to);
    })();
  }, [renderFinePanSlice]);

  const scheduleDragFineRefresh = useCallback(() => {
    if (dragFineTimerRef.current !== null) window.clearTimeout(dragFineTimerRef.current);
    dragFineTimerRef.current = window.setTimeout(() => {
      dragFineTimerRef.current = null;
      fetchDragFine();
    }, DRAG_FINE_REFRESH_MS);
  }, [fetchDragFine]);

  const loadViewport = useCallback((from: number, to: number, query: string) => {
    const seq = ++viewportSeqRef.current;
    setLoading(true);
    // Never blank while the fetch is in flight - see renderFromCacheOrSilhouette.
    renderFromCacheOrSilhouette(from, to, query);

    void (async () => {
      const result = await fetchMonitoringHistory({ from, to, maxPoints: VIEWPORT_MAX_POINTS, series: query });
      if (!mountedRef.current || seq !== viewportSeqRef.current) return;
      if (result.data) {
        setSeries(result.data.series);
        fineSnapshotRef.current = result.data.series;
        setSupported(result.data.supported);
        setRetentionDays(result.data.retentionDays);
        setStepSeconds(result.data.stepSeconds);
        setMocked(result.mocked);
        setError(false);
        bumpNow(result.data.series);
        clampToRetention(result.data.retentionDays);
        if (!result.mocked) cacheRef.current.set(from, to, VIEWPORT_MAX_POINTS, query, result.data);
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
  }, [bumpNow, clampToRetention, renderFromCacheOrSilhouette]);

  // Silently warms the cache for a same-shaped window - no loading/series
  // state touched, so a prefetch that's still in flight (or that fails) is
  // invisible; a later loadViewport for this exact window just finds it
  // already cached.
  const prefetchWindow = useCallback((from: number, to: number, query: string) => {
    if (cacheRef.current.get(from, to, VIEWPORT_MAX_POINTS, query)) return;
    void (async () => {
      const result = await fetchMonitoringHistory({ from, to, maxPoints: VIEWPORT_MAX_POINTS, series: query });
      if (!mountedRef.current || !result.data || result.mocked) return;
      cacheRef.current.set(from, to, VIEWPORT_MAX_POINTS, query, result.data);
    })();
  }, []);

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
  // wasteful) - SILHOUETTE_REFRESH_MS balances minimap staleness against
  // request volume for a background element that doesn't need per-tick
  // precision.
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
  // tick (that's the separate tail poll below). Never fires while the most
  // recent brush event is still 'drag' - this fetch only ever runs once the
  // drag settles to 'end' (the paused-drag fine refresh is the separate,
  // debounced fetchDragFine instead), so the chart never swaps between two
  // DIFFERENT fetches' results while the user is still scrubbing
  // (onBrushChange's own 'end' event bumps fetchEpoch again, re-running this
  // effect once it does). Gated on `supported` (not `error`, unlike the
  // other effects) - a metric switch must still be able to retry after a
  // transient failure, but once the route is confirmed unsupported every
  // series is equally unreachable, so a metric switch must not fire another
  // single-shot 404.
  useEffect(() => {
    if (!enabled || !supported || lastPhaseRef.current === 'drag') return;
    // from/to are read from the ref inside the callback (fired later), not
    // captured now - a live tick that lands before this fires still slides
    // the viewport, and this fetch must use that fresher window rather than
    // a stale snapshot from when the timer was scheduled.
    const timer = window.setTimeout(() => {
      const { from, to } = viewportRef.current;
      loadViewport(from, to, seriesQuery);
    }, 0);
    return () => window.clearTimeout(timer);
    // fetchEpoch is the trigger for user/timer-driven refetches; a live tick
    // alone never retriggers this (see the ref read above).
  }, [enabled, seriesQuery, fetchEpoch, loadViewport, supported]);

  // Idle prefetch: once the viewport goes PREFETCH_IDLE_MS without a real
  // change, warms the cache for the same-width window immediately to the
  // left, so panning further back lands on an instant exact cache hit
  // instead of a fresh round trip. The right neighbor is only prefetched
  // while detached - following's right neighbor is beyond "now" and the
  // live tail already keeps that edge warm.
  useEffect(() => {
    if (!enabled || !supported || error) return;
    const timer = window.setTimeout(() => {
      const { from, to, following } = viewportRef.current;
      const width = to - from;
      prefetchWindow(from - width, from, seriesQuery);
      if (!following) prefetchWindow(to, to + width, seriesQuery);
    }, PREFETCH_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, seriesQuery, fetchEpoch, supported, error, prefetchWindow]);

  // Full re-decimation on a timer, independent of following. Same
  // supported/error gate as the silhouette poll above. Skipped outright
  // while an active drag is in progress - forcing the phase to 'end' here
  // would reopen the fine-fetch gate out from under a still-held drag (the
  // very race the drag-stability fix closes), without going through
  // onBrushChange's own setDragging(false); the drag's own eventual 'end'
  // event re-triggers a fetch anyway.
  useEffect(() => {
    if (!enabled || !supported || error) return;
    const timer = window.setInterval(() => {
      if (lastPhaseRef.current === 'drag') return;
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
  // following AND not mid-drag (read from viewportRef/lastPhaseRef, not the
  // effect's own closed-over `viewport`, so this doesn't need following in
  // its dependency array and therefore doesn't tear the interval down and
  // rebuild it on every attach/detach) - a detached scrub must never have
  // its history mutated out from under it, and a drag that keeps following
  // true throughout (the box's right edge pinned at "now") must not have
  // its own frozen-snapshot pan (renderFinePanSlice) stomped by a
  // concurrent tail merge. The frozen snapshot itself still absorbs the
  // tail regardless of drag phase, so it is current again the moment the
  // drag ends. `to` is anchored to the server time base (lastLoadedTRef, or
  // nowRef before any response has landed) rather than the client clock - a
  // client/relay clock skew against the client's Date.now() could
  // otherwise request a window where from > to and freeze the tail.
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
        if (viewportRef.current.following) {
          fineSnapshotRef.current = mergeTail(fineSnapshotRef.current, tail);
          if (lastPhaseRef.current !== 'drag') setSeries(prev => mergeTail(prev, tail));
        }
        bumpNow(tail);
        if (t > (lastLoadedTRef.current ?? -Infinity)) lastLoadedTRef.current = t;
      })();
    }, LIVE_TAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, seriesQuery, bumpNow, supported, error]);

  const setRange = useCallback((key: PresetKey) => {
    lastPhaseRef.current = 'end';
    setDragging(false);
    clearDragFineTimer();
    setViewport(prev => {
      const next = viewportReducer(prev, { type: 'setRange', key, now: nowRef.current });
      // A wide preset (e.g. 7d) picked on a shorter-retention install must
      // not leave the strip past what the server actually keeps.
      return viewportReducer(next, { type: 'retentionClamp', retentionMs: retentionDaysRef.current * DAY_MS, now: nowRef.current });
    });
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [clearDragFineTimer]);

  const onBrushChange = useCallback((from: number, to: number, phase: 'drag' | 'end') => {
    lastPhaseRef.current = phase;
    setDragging(phase === 'drag');
    setViewport(prev => viewportReducer(prev, { type: 'brushChange', from, to, now: nowRef.current }));
    if (phase === 'drag') {
      // Live rendering while dragging (item 29): pan/clip the fine snapshot
      // (see renderFinePanSlice) - independent of the fetchEpoch bump below,
      // which drives the box's own periodic/on-navigation fine fetch, gated
      // to never fire while still dragging (see that effect). A separate
      // debounced refetch (fetchDragFine, via scheduleDragFineRefresh) is
      // the only fine fetch that runs during the drag itself, upgrading the
      // pan to real data once the user pauses rather than only on release.
      renderFinePanSlice(from, to);
      scheduleDragFineRefresh();
    } else {
      clearDragFineTimer();
    }
    setFetchEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [renderFinePanSlice, scheduleDragFineRefresh, clearDragFineTimer]);

  const onChartDragSelect = useCallback((from: number, to: number) => {
    lastPhaseRef.current = 'end';
    setDragging(false);
    clearDragFineTimer();
    setViewport(prev => viewportReducer(prev, {
      type: 'chartDragSelect', from, to, now: nowRef.current, retentionMs: retentionDaysRef.current * DAY_MS,
    }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [clearDragFineTimer]);

  // No fetchEpoch/stripEpoch/viewportGeneration bump - the box/strip domain
  // is untouched (unlike setRange/onChartDragSelect/backToLive), so there is
  // no new window to fetch or rank around; only `following` changes.
  const detach = useCallback(() => {
    lastPhaseRef.current = 'end';
    setDragging(false);
    clearDragFineTimer();
    setViewport(prev => viewportReducer(prev, { type: 'detach' }));
  }, [clearDragFineTimer]);

  const backToLive = useCallback(() => {
    lastPhaseRef.current = 'end';
    setDragging(false);
    clearDragFineTimer();
    setViewport(prev => viewportReducer(prev, { type: 'backToLive', now: nowRef.current }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [clearDragFineTimer]);

  // Resetting error/supported (rather than calling loadSilhouette directly)
  // re-arms the gated silhouette-poll effect above, which fires its own
  // fetch on this re-run (supported/error are already in its deps) -
  // calling loadSilhouette here too would double it.
  const retry = useCallback(() => {
    lastPhaseRef.current = 'end';
    setDragging(false);
    clearDragFineTimer();
    setSupported(true);
    setError(false);
    setFetchEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [clearDragFineTimer]);

  return {
    silhouette,
    series,
    domain: [viewport.from, viewport.to],
    stripDomain: [viewport.stripFrom, viewport.stripTo],
    rangeKey: viewport.rangeKey,
    lastPresetKey: viewport.lastPresetKey,
    following: viewport.following,
    dragging,
    loading,
    error,
    mocked,
    supported,
    retentionDays,
    stepSeconds,
    viewportGeneration,
    setRange,
    onBrushChange,
    onChartDragSelect,
    detach,
    backToLive,
    retry,
  };
}
