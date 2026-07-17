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
// Trailing debounce while actively dragging - short enough that a brief
// drag pause already shows fresh data (the interim cache/overlap render
// below covers the gap until then), long enough that a fast continuous drag
// doesn't fire a request per pointermove.
const VIEWPORT_DEBOUNCE_MS = 120;
const VIEWPORT_REDECIMATE_MS = 60_000;

// Drag-time live rendering (item 29): a low-resolution fetch fired while the
// seek-bar is actively dragging, throttled to at most one in flight at a
// time (never one request per pointermove). maxPoints is far below the
// box's own VIEWPORT_MAX_POINTS - coarse is fine for a window that's still
// moving; the full-resolution fetch still lands via the existing debounced
// effect once the drag pauses or ends.
const DRAG_COARSE_MAX_POINTS = 100;

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
  const [stepSeconds, setStepSeconds] = useState<number | null>(null);

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
  // Drag-time coarse-fetch pipeline (item 29) - one in flight at a time,
  // coalescing to the LATEST dragged-to window rather than queuing one
  // request per pointermove. See runCoarseDragFetch below for the full
  // throttle strategy. dragCurrentTargetRef always holds the window the user
  // most recently dragged to (set on every 'drag' event, unlike
  // dragCoarsePendingRef which is cleared the moment a fetch for it starts)
  // - a resolved coarse response is only applied when it still matches this,
  // so a fetch for an earlier window that resolves after a newer drag has
  // already moved on (even if that newer drag's own fetch hasn't landed
  // yet) is dropped instead of briefly flashing stale data.
  const dragCoarseInFlightRef = useRef(false);
  const dragCoarsePendingRef = useRef<{ from: number; to: number; query: string } | null>(null);
  const dragCurrentTargetRef = useRef<{ from: number; to: number; query: string } | null>(null);

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

  // Synchronous (no network) interim render for a requested [from, to]
  // window: an exact cache hit renders immediately; a miss falls back to
  // whatever cached window overlaps this one, sliced to the requested
  // range; a further miss falls back to the already-loaded silhouette (the
  // strip's own coarse decimation) similarly sliced, so even a window
  // nothing has fetched at this exact shape before still shows real (if
  // coarser or slightly stale) points instead of a frozen unrelated window.
  // Called both by loadViewport (before its own fetch) and directly by
  // onBrushChange on every 'drag' event, so the chart visibly tracks the
  // seek bar as it moves, not only once a fetch resolves.
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
    if (silhouetteRef.current.length > 0) {
      const sliced = sliceToWindow(
        { supported: true, retentionDays: retentionDaysRef.current, stepSeconds: 0, series: silhouetteRef.current },
        from, to,
      );
      setSeries(sliced.series);
    }
  }, []);

  // Runs (or continues) the drag-time coarse-fetch chase: fetches the
  // LATEST pending dragged-to window at DRAG_COARSE_MAX_POINTS, applies the
  // result only if it still matches dragCurrentTargetRef (a response for an
  // earlier window that resolves after the user has already dragged further
  // - even if that later drag's own fetch hasn't landed yet - must not
  // flash stale data; checking only the drag/end phase isn't enough, since
  // a release-then-immediate-redrag flips the phase back to 'drag' while an
  // older fetch is still in flight), then immediately re-runs for whatever
  // window is pending by the time this one resolves. Because
  // dragCoarseInFlightRef gates entry, at most one request is ever in
  // flight - a fast continuous drag collapses to a steady stream of
  // at-most-one-round-trip-latency updates instead of one request per
  // pointermove (no fetch storm) and touches no state per call beyond the
  // refs (no allocation churn until a response actually lands).
  const runCoarseDragFetch = useCallback(() => {
    if (dragCoarseInFlightRef.current) return;
    const pending = dragCoarsePendingRef.current;
    if (!pending) return;
    dragCoarsePendingRef.current = null;
    dragCoarseInFlightRef.current = true;
    void (async () => {
      const result = await fetchMonitoringHistory({
        from: pending.from, to: pending.to, maxPoints: DRAG_COARSE_MAX_POINTS, series: pending.query,
      });
      dragCoarseInFlightRef.current = false;
      if (mountedRef.current) {
        if (result.data) {
          if (!result.mocked) cacheRef.current.set(pending.from, pending.to, DRAG_COARSE_MAX_POINTS, pending.query, result.data);
          const current = dragCurrentTargetRef.current;
          const isCurrent = current !== null && current.from === pending.from && current.to === pending.to && current.query === pending.query;
          if (lastPhaseRef.current === 'drag' && isCurrent) {
            setSeries(result.data.series);
            setStepSeconds(result.data.stepSeconds);
          }
        }
        runCoarseDragFetch();
      }
    })();
  }, []);

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
    setViewportGeneration(g => g + 1);
  }, []);

  const onBrushChange = useCallback((from: number, to: number, phase: 'drag' | 'end') => {
    lastPhaseRef.current = phase;
    setViewport(prev => viewportReducer(prev, { type: 'brushChange', from, to, now: nowRef.current }));
    if (phase === 'drag') {
      // Live rendering while dragging (item 29): render synchronously from
      // whatever's already in memory, then queue/continue the throttled
      // coarse fetch for progressive refinement - both independent of the
      // fetchEpoch bump below, which still drives the existing debounced
      // full-resolution fetch (fires on a drag pause or on release).
      renderFromCacheOrSilhouette(from, to, seriesQuery);
      const target = { from, to, query: seriesQuery };
      dragCurrentTargetRef.current = target;
      dragCoarsePendingRef.current = target;
      runCoarseDragFetch();
    }
    setFetchEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, [renderFromCacheOrSilhouette, runCoarseDragFetch, seriesQuery]);

  const onChartDragSelect = useCallback((from: number, to: number) => {
    lastPhaseRef.current = 'end';
    setViewport(prev => viewportReducer(prev, {
      type: 'chartDragSelect', from, to, now: nowRef.current, retentionMs: retentionDaysRef.current * DAY_MS,
    }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
  }, []);

  const backToLive = useCallback(() => {
    lastPhaseRef.current = 'end';
    setViewport(prev => viewportReducer(prev, { type: 'backToLive', now: nowRef.current }));
    setFetchEpoch(e => e + 1);
    setStripEpoch(e => e + 1);
    setViewportGeneration(g => g + 1);
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
    setViewportGeneration(g => g + 1);
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
    stepSeconds,
    viewportGeneration,
    setRange,
    onBrushChange,
    onChartDragSelect,
    backToLive,
    retry,
  };
}
