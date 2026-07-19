import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useChartHoverTooltip } from '../../../hooks/useChartHoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import {
  GAP_MULTIPLIER,
  avgValueRange,
  formatTooltipTimestamp,
  medianSpacingMs,
  medianSpacingOfPoints,
  nearestPoint,
  niceTicks,
  resolveValueDomain,
  ribbonOpacityFraction,
  splitIntoSegments,
  timeDomain,
  type TimeSeriesPoint,
  type TimeSeriesSeries,
} from './timeSeriesChartUtils';
import styles from './TimeSeriesChart.module.scss';

export type { TimeSeriesPoint, TimeSeriesSeries } from './timeSeriesChartUtils';

export interface TimeSeriesBand {
  startT: number;
  endT: number;
  color?: string;
}

export interface ChartRibbonSpec {
  /** Points over the same window/domain as the chart's own series - also the
   *  source of this ribbon's own adaptive opacity range: the window's own
   *  observed min/max among these points' avg values (see avgValueRange),
   *  recomputed whenever the points change, the same adaptive spirit as the
   *  main chart's own y-axis. */
  points: readonly TimeSeriesPoint[];
  fill: string;
  /** Rendered at the y-axis label's own x position (see yAxisSide),
   *  vertically centered on this ribbon's band - e.g. the current
   *  temperature. Omit to render no label for this ribbon. */
  valueLabel?: string;
  /** Hover tooltip (the shared HoverTooltip component) for the valueLabel
   *  text - e.g. which fans a summed RPM reading covers. Omit for no
   *  tooltip. */
  valueLabelTooltip?: string;
  /** Rendered in the pad lane opposite the axis labels, vertically centered
   *  on this ribbon's band - must already be sized to RIBBON_ICON_SIZE
   *  (e.g. `<Fan size={12} />`). Omit to render no icon for this ribbon. */
  icon?: ReactNode;
  /** Accessible name for this band (e.g. "Average fan duty") - the ribbon is
   *  otherwise a decorative SVG shape with no text content of its own.
   *  Omit to render no label. */
  ariaLabel?: string;
  /** Band thickness in px. Defaults to RIBBON_DEFAULT_HEIGHT. */
  height?: number;
}

export interface TimeSeriesChartProps {
  series: TimeSeriesSeries[];
  height?: number;
  valueFormat: (value: number) => string;
  /** Caller picks the label granularity (hours/weekday/dates) for the requested range. */
  xTickFormat: (t: number) => string;
  xTickCount?: number;
  yTickCount?: number;
  /** Short labels for the tooltip's avg/max rows (e.g. "Avg" / "Max"), translated by the caller. */
  avgLabel: string;
  maxLabel: string;
  /** Subtle translucent vertical bands (e.g. sustained-high-temperature episodes). */
  bands?: readonly TimeSeriesBand[];
  showLegend?: boolean;
  /** Force the x-axis window instead of deriving it from the data extent, so a
   *  range wider than the available data shows empty space rather than
   *  stretching the data to fill it. Falls back to the data extent when omitted. */
  domain?: readonly [number, number];
  /** Extra content appended to the hover tooltip after the series rows, e.g.
   *  a per-bucket breakdown the chart itself has no concept of. Called with
   *  the hovered timestamp; renders nothing when it returns null. */
  tooltipExtra?: (t: number) => ReactNode;
  /** Forces one or both y-axis bounds instead of deriving them from the data
   *  (e.g. [0, 100] for a percent chart, [0, null] to pin the floor at zero
   *  while the ceiling still auto-scales). null on a side derives that side
   *  from the data; omitting the prop entirely keeps the pure data-driven
   *  domain. */
  yDomain?: readonly [number | null, number | null];
  /** Renders each series as a filled area (vertical gradient, opaque near
   *  the line fading to transparent at the baseline) instead of a bare
   *  stroke. Opt-in - other callers (Diagnostics) keep the stroke-only look. */
  fillGradient?: boolean;
  /** Suppresses the default per-series avg/max tooltip rows, leaving only
   *  the timestamp header and tooltipExtra - for a caller building an
   *  entirely custom tooltip body. */
  hideSeriesRows?: boolean;
  /** Renders a single value per series tooltip row (the point's own avg,
   *  with no avg/max labels) instead of the default avg+max pair - for a
   *  caller whose series already represent one instantaneous reading
   *  (e.g. a temperature sample) rather than a bucket with a distinct
   *  average and peak. */
  singleValueTooltip?: boolean;
  /** Enables drag-to-select on the plot: a horizontal rubber-band drag
   *  reports its [from, to] on release (ascending order), Escape cancels
   *  mid-drag. Omit to leave the chart click/drag-inert (its default). */
  onRangeSelect?: (from: number, to: number) => void;
  /** The data's actual effective point spacing in seconds (e.g. the
   *  service's reported stepSeconds), when known - drives whether the hover
   *  tooltip's time label includes seconds precision. Omit when unknown;
   *  the tooltip then stays minute-precision regardless of zoom. */
  stepSeconds?: number | null;
  /** Extra content rendered in the SAME row as the tooltip's timestamp
   *  (time on the left, this on the right) - for a single value that
   *  belongs beside the header rather than the tooltipExtra body below
   *  (e.g. the current temperature). Called with the hovered timestamp;
   *  renders nothing when it returns null. */
  tooltipHeaderExtra?: (t: number) => ReactNode;
  /** Which side the y-axis tick labels (and a ribbon's own valueLabel)
   *  render on. Default 'left' preserves every existing consumer's layout;
   *  the monitoring hero chart uses 'right' to match the cooling trend
   *  chart's own right-side-label convention. */
  yAxisSide?: 'left' | 'right';
  /** Fixed-height, opacity-modulated bands rendered INSIDE the plot, stacked
   *  in order directly under the line/area and above the x-axis labels -
   *  they share this chart's own x-domain and pixel mapping (xFor), so they
   *  stay pixel-aligned with the line without a separate alignment
   *  computation. The line/area's own vertical range shrinks to make room
   *  for them. */
  ribbons?: readonly ChartRibbonSpec[];
  /** A persistent vertical marker at timestamp `t` - distinct from the
   *  transient dashed hover cursor, this one stays put regardless of the
   *  pointer. Omit/null renders none. */
  selectedT?: number | null;
  /** Fires with the clicked timestamp on a plain click (pointer movement
   *  under the drag-select threshold) - a real drag still only fires
   *  onRangeSelect, never this. Independent of onRangeSelect; either or both
   *  may be supplied. */
  onPointClick?: (t: number) => void;
}

// A pointer must move at least this many px before a drag counts as a
// range-select rather than a stray click.
const DRAG_SELECT_THRESHOLD_PX = 4;

const CHART_PAD = { left: 56, right: 16, top: 12, bottom: 28 };
// Mirrors CHART_PAD with the axis-label lane moved to the right edge
// (yAxisSide='right') - left/right swapped, and right widened past CHART_PAD's
// own left lane so a 5-digit ribbon value (e.g. "12345 RPM") fits the
// axis-label text without clipping into the plot.
const CHART_PAD_RIGHT_AXIS = { left: 16, right: 80, top: 12, bottom: 28 };

// Ribbon band thickness (px) when a ChartRibbonSpec omits its own height,
// and the icon size a ribbon's `icon` node must already be sized to.
const RIBBON_DEFAULT_HEIGHT = 14;
export const RIBBON_ICON_SIZE = 12;
// Ribbon opacity floor - a segment at the window's own observed min still
// reads as a faint but visible fill rather than fully disappearing; a
// segment at the window's own observed max reaches full opacity.
const RIBBON_OPACITY_FLOOR = 0.1;
// Vertical breathing room between the line's own bottom gridline/tick label
// and the first ribbon band - without it the line's minimum-value tick (e.g.
// "0%") and a ribbon's valueLabel sit close enough to visually overlap.
const RIBBON_GAP_PX = 12;
// Vertical breathing room between two stacked ribbon bands (e.g. temperature
// above fan speed) - without it adjacent bands touch and read as one shape.
const RIBBON_BAND_SPACING_PX = 6;
// Half-width, px, of the marker drawn for a ribbon point isolated between two
// gaps on both sides - it would otherwise have no bar to extend from or into
// and vanish entirely, matching the line's own isolated-point dot treatment.
const RIBBON_ISOLATED_POINT_HALF_WIDTH_PX = 1.5;

export function TimeSeriesChart({
  series, height = 260, valueFormat, xTickFormat, xTickCount = 5, yTickCount = 5,
  avgLabel, maxLabel, bands, showLegend = true, domain, tooltipExtra, yDomain,
  fillGradient = false, hideSeriesRows = false, onRangeSelect, stepSeconds, tooltipHeaderExtra,
  yAxisSide = 'left', ribbons, selectedT, onPointClick, singleValueTooltip = false,
}: TimeSeriesChartProps) {
  const { t, language } = useTranslation();
  const pad = yAxisSide === 'right' ? CHART_PAD_RIGHT_AXIS : CHART_PAD;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Clips the data marks to the plot rect so a point just outside a forced
  // domain (clock/timezone skew) cannot draw over the axis labels. Colons from
  // useId are stripped so the url(#id) reference stays well-formed.
  const clipId = `tsc-plot-${useId().replace(/:/g, '')}`;
  // A series id can itself contain a colon (e.g. a GPU series id like
  // "gpu:0") - stripped for the same url(#id) well-formedness reason as
  // clipId above.
  const gradientId = (seriesId: string) => `${clipId}-${seriesId.replace(/:/g, '')}`;
  // Snapshot at mount rather than reading Date.now() during render (the
  // year-omission check only needs a stable "now", not a live clock).
  const [nowMs] = useState(() => Date.now());

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) setWidth(Math.round(initialW));
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // An explicit domain wins so a range wider than the data leaves the empty
  // span blank; otherwise fall back to the data's own extent.
  const dataDomain = useMemo(() => timeDomain(series), [series]);
  const domainT = domain ?? dataDomain;
  const [minV, maxV] = useMemo(() => resolveValueDomain(series, yDomain), [series, yDomain]);
  const spacingMs = useMemo(() => medianSpacingMs(series), [series]);
  const maxGapMs = spacingMs !== null ? spacingMs * GAP_MULTIPLIER : Infinity;

  const chartW = Math.max(1, width - pad.left - pad.right);
  const chartH = Math.max(1, height - pad.top - pad.bottom);

  // Ribbons stack at the bottom of the plot, under the line/area - its own
  // vertical range shrinks to lineChartH to make room (including RIBBON_GAP_PX
  // ahead of the first band and RIBBON_BAND_SPACING_PX between each pair),
  // leaving the ribbons' slots at [pad.top + lineChartH + RIBBON_GAP_PX,
  // pad.top + chartH]. xTicks below stay anchored to chartH's own bottom edge
  // (unchanged), so they land below every ribbon automatically.
  const ribbonsTotalHeight = useMemo(() => {
    const list = ribbons ?? [];
    if (list.length === 0) return 0;
    const bandsHeight = list.reduce((sum, r) => sum + (r.height ?? RIBBON_DEFAULT_HEIGHT), 0);
    return bandsHeight + RIBBON_BAND_SPACING_PX * (list.length - 1) + RIBBON_GAP_PX;
  }, [ribbons]);
  const lineChartH = Math.max(1, chartH - ribbonsTotalHeight);

  const xFor = useCallback((t2: number) => {
    if (!domainT) return pad.left;
    const [minT, maxT] = domainT;
    const span = maxT - minT || 1;
    return pad.left + ((t2 - minT) / span) * chartW;
  }, [domainT, chartW, pad.left]);

  const yFor = useCallback((v: number) => {
    const span = maxV - minV || 1;
    return pad.top + lineChartH - ((v - minV) / span) * lineChartH;
  }, [minV, maxV, lineChartH, pad.top]);

  const axisLabelX = yAxisSide === 'right' ? width - pad.right + 6 : pad.left - 6;
  const axisLabelAnchor: 'start' | 'end' = yAxisSide === 'right' ? 'start' : 'end';
  const iconLaneX = yAxisSide === 'right' ? pad.left / 2 : width - pad.right / 2;

  const ribbonBands = useMemo(() => {
    const list = ribbons ?? [];
    let bandTop = pad.top + lineChartH + (list.length > 0 ? RIBBON_GAP_PX : 0);
    return list.map((ribbon, i) => {
      const bandHeight = ribbon.height ?? RIBBON_DEFAULT_HEIGHT;
      if (i > 0) bandTop += RIBBON_BAND_SPACING_PX;
      const top = bandTop;
      bandTop += bandHeight;
      // Gap-aware, derived from this ribbon's own points rather than the
      // main series' pooled spacing - a ribbon (e.g. fan speed) can sample
      // at a different cadence than the plotted line it sits under.
      const maxGapMs = (medianSpacingOfPoints(ribbon.points) ?? Infinity) * GAP_MULTIPLIER;
      const segments = splitIntoSegments(ribbon.points, maxGapMs);
      // This ribbon's own adaptive opacity range - the window's own observed
      // min/max among its own points, recomputed whenever they change.
      const range = avgValueRange(ribbon.points);
      return { ribbon, top, bandHeight, segments, maxGapMs, range };
    });
  }, [ribbons, pad.top, lineChartH]);

  // Gap-aware per series, not per chart - an overlay (e.g. the selected-app
  // line) can sample at a much sparser cadence than the base metric series
  // that spacingMs above is derived from, which would otherwise isolate
  // nearly every one of its points into its own single-point segment.
  const segmentsBySeries = useMemo(
    () => series.map(s => {
      const gapMs = (medianSpacingOfPoints(s.points) ?? Infinity) * GAP_MULTIPLIER;
      return { s, segments: splitIntoSegments(s.points, gapMs) };
    }),
    [series],
  );

  // niceTicks can round its floor below the actual value minimum. Harmless
  // when the floor is already forced to a round number (monitoring's
  // yDomain=[0, ...] never rounds below 0), but on a purely data-driven
  // floor (cooling, no yDomain) that below-minimum tick's y falls below the
  // line's own plot area, into the ribbon gap/band, colliding with the
  // ribbon's fill and value label. Dropping ticks under minV removes only
  // ones with no line data to reference in the first place.
  const yTicks = useMemo(() => niceTicks(minV, maxV, yTickCount).filter(tick => tick >= minV), [minV, maxV, yTickCount]);

  const xTicks = useMemo(() => {
    if (!domainT) return [];
    const [minT, maxT] = domainT;
    const ticks: number[] = [];
    for (let i = 0; i < xTickCount; i++) {
      const frac = xTickCount > 1 ? i / (xTickCount - 1) : 0;
      ticks.push(Math.round(minT + frac * (maxT - minT)));
    }
    return ticks;
  }, [domainT, xTickCount]);

  const tooltip = useMemo(() => {
    if (hoverT === null) return null;
    const rows = series
      .map(s => ({ id: s.id, name: s.name, color: s.color, point: nearestPoint(s.points, hoverT, maxGapMs) }))
      .filter((r): r is { id: string; name: string; color: string; point: NonNullable<typeof r.point> } => r.point !== null);
    if (rows.length === 0) return null;
    return { t: rows[0].point.t, rows };
  }, [hoverT, series, maxGapMs]);

  const { tooltipRef, trackCursor } = useChartHoverTooltip(wrapRef, tooltip !== null);

  const tToPx = useCallback((clientX: number, rect: DOMRect) => ((clientX - rect.left) / rect.width) * width, [width]);

  const pxToT = useCallback((svgX: number) => {
    if (!domainT) return null;
    const [minT, maxT] = domainT;
    const frac = Math.max(0, Math.min(1, (svgX - pad.left) / chartW));
    return Math.round(minT + frac * (maxT - minT));
  }, [domainT, chartW, pad.left]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!domainT) return;
    trackCursor(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = tToPx(e.clientX, rect);
    // Outside the plot rect (the axis-label gutter on either side) - clear
    // rather than clamp, so the cursor/tooltip can't stick at the plot edge
    // while the pointer sits over the tick labels.
    if (svgX < pad.left || svgX > pad.left + chartW) {
      setHoverT(null);
      return;
    }
    const t = pxToT(svgX);
    if (t !== null) setHoverT(t);
  }, [domainT, tToPx, pxToT, trackCursor, pad.left, chartW]);

  // Drag-select: pointer-captured horizontal rubber-band, opt-in via
  // onRangeSelect. dragStartT/dragCurT drive the overlay rect; a move under
  // DRAG_SELECT_THRESHOLD_PX is a stray click instead - reported via
  // onPointClick (a real drag never fires that, only onRangeSelect).
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartPxRef = useRef(0);
  const [dragStartT, setDragStartT] = useState<number | null>(null);
  const [dragCurT, setDragCurT] = useState<number | null>(null);
  const isDragging = dragStartT !== null;

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if ((!onRangeSelect && !onPointClick) || !domainT) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = tToPx(e.clientX, rect);
    const t = pxToT(px);
    if (t === null) return;
    dragPointerIdRef.current = e.pointerId;
    dragStartPxRef.current = px;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStartT(t);
    setDragCurT(t);
  }, [onRangeSelect, onPointClick, domainT, tToPx, pxToT]);

  const onPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = pxToT(tToPx(e.clientX, rect));
    if (t !== null) setDragCurT(t);
  }, [pxToT, tToPx]);

  const endDrag = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const endPx = tToPx(e.clientX, rect);
    const movedPx = Math.abs(endPx - dragStartPxRef.current);
    dragPointerIdRef.current = null;
    if (movedPx >= DRAG_SELECT_THRESHOLD_PX && dragStartT !== null) {
      const endT = pxToT(endPx);
      if (endT !== null) {
        const [from, to] = dragStartT <= endT ? [dragStartT, endT] : [endT, dragStartT];
        onRangeSelect?.(from, to);
      }
    } else if (dragStartT !== null) {
      onPointClick?.(dragStartT);
    }
    setDragStartT(null);
    setDragCurT(null);
  }, [dragStartT, tToPx, pxToT, onRangeSelect, onPointClick]);

  // Esc cancels an in-progress drag-select without reporting a range.
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      dragPointerIdRef.current = null;
      setDragStartT(null);
      setDragCurT(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDragging]);

  if (!domainT) {
    return (
      <div ref={wrapRef} className={styles.chartWrap}>
        <div className={styles.empty}>{t('chart.waiting')}</div>
      </div>
    );
  }

  const hoverX = tooltip && !isDragging ? xFor(tooltip.t) : null;
  const baselineY = yFor(minV);
  const selectionX0 = dragStartT !== null && dragCurT !== null ? Math.min(xFor(dragStartT), xFor(dragCurT)) : null;
  const selectionX1 = dragStartT !== null && dragCurT !== null ? Math.max(xFor(dragStartT), xFor(dragCurT)) : null;

  return (
    <div ref={wrapRef} className={styles.chartWrap}>
      <svg
        className={(onRangeSelect || onPointClick) ? `${styles.chart} ${styles.chartSelectable}` : styles.chart}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverT(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={pad.left} y={pad.top} width={chartW} height={chartH} />
          </clipPath>
          {fillGradient && series.filter(s => !s.noFill).map(s => (
            <linearGradient key={s.id} id={gradientId(s.id)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map((tick, i) => {
          const y = yFor(tick);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={axisLabelX} y={y + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor={axisLabelAnchor}>
                {valueFormat(tick)}
              </text>
            </g>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
        {bands?.map((band, i) => (
          <rect
            key={i}
            x={xFor(band.startT)}
            y={pad.top}
            width={Math.max(1, xFor(band.endT) - xFor(band.startT))}
            height={chartH}
            fill={band.color ?? 'var(--bad)'}
            fillOpacity={0.12}
          />
        ))}

        {segmentsBySeries.map(({ s, segments }) => segments.map((segment, si) => {
          if (segment.length === 0) return null;
          // A single-point segment (isolated between two gaps) has no line
          // to draw - a moveto-only path is invisible - so render it as a dot,
          // unless the series opts out via noDots.
          if (segment.length === 1) {
            if (s.noDots) return null;
            return (
              <circle
                key={`${s.id}-${si}`}
                cx={xFor(segment[0].t)}
                cy={yFor(segment[0].avg)}
                r={2.5}
                fill={s.color}
              />
            );
          }
          const d = segment.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.t).toFixed(1)},${yFor(p.avg).toFixed(1)}`).join(' ');
          return (
            <g key={`${s.id}-${si}`}>
              {fillGradient && !s.noFill && (
                <path
                  d={`${d} L${xFor(segment[segment.length - 1].t).toFixed(1)},${baselineY.toFixed(1)} L${xFor(segment[0].t).toFixed(1)},${baselineY.toFixed(1)} Z`}
                  fill={`url(#${gradientId(s.id)})`}
                  stroke="none"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        }))}
        </g>

        {ribbonBands.map(({ ribbon, top, bandHeight, segments, maxGapMs: ribbonMaxGapMs, range }, ri) => {
          const midY = top + bandHeight / 2;
          const opacityFor = (avg: number) => {
            if (!range) return 1;
            const frac = ribbonOpacityFraction(avg, range[0], range[1]);
            return RIBBON_OPACITY_FLOOR + frac * (1 - RIBBON_OPACITY_FLOOR);
          };
          return (
            <g key={ri} role={ribbon.ariaLabel ? 'img' : undefined} aria-label={ribbon.ariaLabel}>
              <g clipPath={`url(#${clipId})`}>
              {segments.map((segment, si) => {
                const isFinalSegment = si === segments.length - 1;
                return segment.map((p, i) => {
                  const isLastInSegment = i === segment.length - 1;
                  const opacity = opacityFor(p.avg);
                  const x0 = xFor(p.t);
                  const hasNextInSegment = !isLastInSegment;
                  // The very last point overall only extends to the plot's
                  // right edge when that trailing stretch is itself within
                  // the gap threshold - otherwise a stale last reading (the
                  // series stopped reporting well before "now") would
                  // falsely persist all the way to the live edge, the same
                  // failure mode as a mid-sequence gap.
                  const staleTail = isLastInSegment && isFinalSegment && domainT[1] - p.t > ribbonMaxGapMs;
                  const extendsForward = hasNextInSegment || (isLastInSegment && isFinalSegment && !staleTail);
                  if (!extendsForward) {
                    if (segment.length > 1) return null;
                    // A point isolated between two gaps (or a stale trailing
                    // point with no forward neighbor at all) has no adjacent
                    // point to extend a bar from or into - a thin marker
                    // instead of vanishing entirely.
                    return (
                      <rect
                        key={p.t}
                        x={x0 - RIBBON_ISOLATED_POINT_HALF_WIDTH_PX}
                        y={top}
                        width={RIBBON_ISOLATED_POINT_HALF_WIDTH_PX * 2}
                        height={bandHeight}
                        fill={ribbon.fill}
                        fillOpacity={opacity}
                      />
                    );
                  }
                  const x1 = hasNextInSegment ? xFor(segment[i + 1].t) : pad.left + chartW;
                  return (
                    <rect
                      key={p.t}
                      x={x0}
                      y={top}
                      width={Math.max(0, x1 - x0)}
                      height={bandHeight}
                      fill={ribbon.fill}
                      fillOpacity={opacity}
                    />
                  );
                });
              })}
              </g>
              {ribbon.icon && (
                <g transform={`translate(${iconLaneX - RIBBON_ICON_SIZE / 2}, ${midY - RIBBON_ICON_SIZE / 2})`}>
                  {ribbon.icon}
                </g>
              )}
              {ribbon.valueLabel !== undefined && (
                ribbon.valueLabelTooltip !== undefined ? (
                  <HoverTooltip body={ribbon.valueLabelTooltip} side="top">
                    <text x={axisLabelX} y={midY + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor={axisLabelAnchor} tabIndex={0}>
                      {ribbon.valueLabel}
                    </text>
                  </HoverTooltip>
                ) : (
                  <text x={axisLabelX} y={midY + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor={axisLabelAnchor}>
                    {ribbon.valueLabel}
                  </text>
                )
              )}
            </g>
          );
        })}

        {selectionX0 !== null && selectionX1 !== null && (
          // Rendered after the ribbons (not inside the clipped line/area
          // group above) so its translucent tint paints OVER an opaque
          // ribbon band too, instead of the band hiding the tint underneath
          // it across the ribbon's own height.
          <rect
            className={styles.dragSelection}
            x={selectionX0}
            y={pad.top}
            width={Math.max(1, selectionX1 - selectionX0)}
            height={chartH}
          />
        )}

        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={Math.min(Math.max(xFor(tick), pad.left), width - pad.right)}
            y={pad.top + chartH + 16}
            fill="var(--text-dim)"
            fontSize="11"
            fontFamily="var(--font-mono)"
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {xTickFormat(tick)}
          </text>
        ))}

        {selectedT !== null && selectedT !== undefined && (
          // Persistent - pinned by a click (or defaulting to the domain's
          // own right edge), unlike the transient dashed hover cursor below.
          <line
            x1={xFor(selectedT)} y1={pad.top} x2={xFor(selectedT)} y2={pad.top + chartH}
            stroke="var(--text)" strokeWidth="1.5" opacity="1"
          />
        )}

        {hoverX !== null && (
          <line x1={hoverX} y1={pad.top} x2={hoverX} y2={pad.top + chartH} stroke="var(--text)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        )}
      </svg>

      {tooltip && !isDragging && (
        <div ref={tooltipRef} className={styles.tooltip}>
          <div className={styles.tooltipHeader}>
            <span>{formatTooltipTimestamp(tooltip.t, nowMs, language, stepSeconds)}</span>
            {tooltipHeaderExtra?.(tooltip.t)}
          </div>
          {!hideSeriesRows && tooltip.rows.map(row => (
            <div key={row.id} className={styles.tooltipRow}>
              <span className={styles.tooltipDot} style={{ background: row.color }} />
              <span className={styles.tooltipName}>{row.name}</span>
              {singleValueTooltip ? (
                <span className={styles.tooltipVal}>{valueFormat(row.point.avg)}</span>
              ) : (
                <>
                  <span className={styles.tooltipVal}>{avgLabel} {valueFormat(row.point.avg)}</span>
                  <span className={styles.tooltipVal}>{maxLabel} {valueFormat(row.point.max)}</span>
                </>
              )}
            </div>
          ))}
          {tooltipExtra?.(tooltip.t)}
        </div>
      )}

      {showLegend && series.length > 0 && (
        <div className={styles.legend}>
          {series.map(s => (
            <span key={s.id} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: s.color }} />
              <span className={styles.legendName}>{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
