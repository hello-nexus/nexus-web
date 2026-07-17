import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useChartHoverTooltip } from '../../../hooks/useChartHoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import {
  GAP_MULTIPLIER,
  formatTooltipTimestamp,
  medianSpacingMs,
  nearestPoint,
  niceTicks,
  resolveValueDomain,
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
  /** Points over the same window/domain as the chart's own series. */
  points: readonly TimeSeriesPoint[];
  /** Absolute thickness-scale floor/ceiling - the ribbon reads the same way
   *  regardless of the window's own observed min/max (e.g.
   *  metricHistoryHelpers.ts's TEMP_RIBBON_FLOOR_C / CPU_TEMP_RIBBON_CAP_C). */
  floor: number;
  cap: number;
  fill: string;
  /** Rendered at the y-axis label's own x position (see yAxisSide),
   *  vertically centered on this ribbon's band - e.g. the current
   *  temperature. Omit to render no label for this ribbon. */
  valueLabel?: string;
  /** Rendered in the pad lane opposite the axis labels, vertically centered
   *  on this ribbon's band - must already be sized to RIBBON_ICON_SIZE
   *  (e.g. `<Fan size={12} />`). Omit to render no icon for this ribbon. */
  icon?: ReactNode;
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
  /** Thin thickness-modulated bands rendered INSIDE the plot, stacked in
   *  order directly under the line/area and above the x-axis labels - they
   *  share this chart's own x-domain and pixel mapping (xFor), so they stay
   *  pixel-aligned with the line without a separate alignment computation.
   *  The line/area's own vertical range shrinks to make room for them. */
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
  /** A "current value" readout for the plotted line/area itself, at the
   *  axis label's x position and the y corresponding to `value` - the
   *  line's own analogue to a ribbon's valueLabel (e.g. the selected
   *  frame's plotted value). Omit to render none. */
  currentValue?: { value: number; label: string };
}

// A pointer must move at least this many px before a drag counts as a
// range-select rather than a stray click.
const DRAG_SELECT_THRESHOLD_PX = 4;

const CHART_PAD = { left: 56, right: 16, top: 12, bottom: 28 };
// Mirrors CHART_PAD with the axis-label lane moved to the right edge
// (yAxisSide='right') - same top/bottom, left/right swapped.
const CHART_PAD_RIGHT_AXIS = { left: 16, right: 56, top: 12, bottom: 28 };

// Ribbon band thickness (px) when a ChartRibbonSpec omits its own height,
// and the icon size a ribbon's `icon` node must already be sized to.
const RIBBON_DEFAULT_HEIGHT = 12;
export const RIBBON_ICON_SIZE = 12;
// Ribbon thickness floor, px - the band never fully disappears at the
// spec's floor value and never exceeds its own band height at the cap.
const RIBBON_MIN_THICKNESS_PX = 1.5;
// Vertical breathing room between the line's own bottom gridline/tick label
// and the first ribbon band - without it the line's minimum-value tick (e.g.
// "0%") and a ribbon's valueLabel sit close enough to visually overlap.
const RIBBON_GAP_PX = 8;

export function TimeSeriesChart({
  series, height = 260, valueFormat, xTickFormat, xTickCount = 5, yTickCount = 5,
  avgLabel, maxLabel, bands, showLegend = true, domain, tooltipExtra, yDomain,
  fillGradient = false, hideSeriesRows = false, onRangeSelect, stepSeconds, tooltipHeaderExtra,
  yAxisSide = 'left', ribbons, selectedT, onPointClick, currentValue,
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
  // ahead of the first band), leaving the ribbons' slots at
  // [pad.top + lineChartH + RIBBON_GAP_PX, pad.top + chartH]. xTicks below
  // stay anchored to chartH's own bottom edge (unchanged), so they land below
  // every ribbon automatically.
  const ribbonsTotalHeight = useMemo(() => {
    const bandsHeight = (ribbons ?? []).reduce((sum, r) => sum + (r.height ?? RIBBON_DEFAULT_HEIGHT), 0);
    return bandsHeight > 0 ? bandsHeight + RIBBON_GAP_PX : 0;
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
    let bandTop = pad.top + lineChartH + ((ribbons?.length ?? 0) > 0 ? RIBBON_GAP_PX : 0);
    return (ribbons ?? []).map(ribbon => {
      const bandHeight = ribbon.height ?? RIBBON_DEFAULT_HEIGHT;
      const top = bandTop;
      bandTop += bandHeight;
      return { ribbon, top, bandHeight };
    });
  }, [ribbons, pad.top, lineChartH]);

  const segmentsBySeries = useMemo(
    () => series.map(s => ({ s, segments: splitIntoSegments(s.points, maxGapMs) })),
    [series, maxGapMs],
  );

  const yTicks = useMemo(() => niceTicks(minV, maxV, yTickCount), [minV, maxV, yTickCount]);

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
    const t = pxToT(tToPx(e.clientX, rect));
    if (t !== null) setHoverT(t);
  }, [domainT, tToPx, pxToT, trackCursor]);

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
          {fillGradient && series.map(s => (
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
          // to draw - a moveto-only path is invisible - so render it as a dot.
          if (segment.length === 1) {
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
              {fillGradient && (
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

        {ribbonBands.map(({ ribbon, top, bandHeight }, ri) => {
          const midY = top + bandHeight / 2;
          const span = ribbon.cap - ribbon.floor || 1;
          return (
            <g key={ri}>
              {ribbon.points.map((p, i) => {
                const x0 = xFor(p.t);
                const x1 = i + 1 < ribbon.points.length ? xFor(ribbon.points[i + 1].t) : pad.left + chartW;
                const frac = Math.max(0, Math.min(1, (p.avg - ribbon.floor) / span));
                const thickness = RIBBON_MIN_THICKNESS_PX + frac * (bandHeight - RIBBON_MIN_THICKNESS_PX);
                return (
                  <rect
                    key={p.t}
                    x={x0}
                    y={midY - thickness / 2}
                    width={Math.max(0, x1 - x0)}
                    height={thickness}
                    fill={ribbon.fill}
                  />
                );
              })}
              {ribbon.icon && (
                <g transform={`translate(${iconLaneX - RIBBON_ICON_SIZE / 2}, ${midY - RIBBON_ICON_SIZE / 2})`}>
                  {ribbon.icon}
                </g>
              )}
              {ribbon.valueLabel !== undefined && (
                <text x={axisLabelX} y={midY + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor={axisLabelAnchor}>
                  {ribbon.valueLabel}
                </text>
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
            stroke="var(--accent)" strokeWidth="1.5" opacity="0.9"
          />
        )}

        {currentValue && (
          <text x={axisLabelX} y={yFor(currentValue.value) + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor={axisLabelAnchor}>
            {currentValue.label}
          </text>
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
              <span className={styles.tooltipVal}>{avgLabel} {valueFormat(row.point.avg)}</span>
              <span className={styles.tooltipVal}>{maxLabel} {valueFormat(row.point.max)}</span>
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
