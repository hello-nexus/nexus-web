import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useChartHoverTooltip } from '../../../hooks/useChartHoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import {
  formatTooltipTimestamp,
  medianSpacingMs,
  nearestPoint,
  niceTicks,
  resolveValueDomain,
  splitIntoSegments,
  timeDomain,
  type TimeSeriesSeries,
} from './timeSeriesChartUtils';
import styles from './TimeSeriesChart.module.scss';

export type { TimeSeriesPoint, TimeSeriesSeries } from './timeSeriesChartUtils';

export interface TimeSeriesBand {
  startT: number;
  endT: number;
  color?: string;
}

// A gap wider than this multiple of the actual median point spacing renders
// as a line break (and the hover tooltip stops attaching a series' value).
// Derived from the data itself, not a nominal bucket size: server-side
// decimation widens real point spacing well past the source bucket at wide
// ranges, so a caller-supplied nominal size would flag every decimated point
// as a gap and render the whole chart blank.
const GAP_MULTIPLIER = 1.5;

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
}

// A pointer must move at least this many px before a drag counts as a
// range-select rather than a stray click.
const DRAG_SELECT_THRESHOLD_PX = 4;

// Exported so companion elements drawn outside the chart itself (e.g.
// TempRibbon, sitting directly under the plot) can inset by the same amount
// and stay pixel-aligned with it, given the same container width.
export const CHART_PAD = { left: 56, right: 16, top: 12, bottom: 28 };

export function TimeSeriesChart({
  series, height = 260, valueFormat, xTickFormat, xTickCount = 5, yTickCount = 5,
  avgLabel, maxLabel, bands, showLegend = true, domain, tooltipExtra, yDomain,
  fillGradient = false, hideSeriesRows = false, onRangeSelect,
}: TimeSeriesChartProps) {
  const { t, language } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Clips the data marks to the plot rect so a point just outside a forced
  // domain (clock/timezone skew) cannot draw over the axis labels. Colons from
  // useId are stripped so the url(#id) reference stays well-formed.
  const clipId = `tsc-plot-${useId().replace(/:/g, '')}`;
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

  const chartW = Math.max(1, width - CHART_PAD.left - CHART_PAD.right);
  const chartH = Math.max(1, height - CHART_PAD.top - CHART_PAD.bottom);

  const xFor = useCallback((t2: number) => {
    if (!domainT) return CHART_PAD.left;
    const [minT, maxT] = domainT;
    const span = maxT - minT || 1;
    return CHART_PAD.left + ((t2 - minT) / span) * chartW;
  }, [domainT, chartW]);

  const yFor = useCallback((v: number) => {
    const span = maxV - minV || 1;
    return CHART_PAD.top + chartH - ((v - minV) / span) * chartH;
  }, [minV, maxV, chartH]);

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
    const frac = Math.max(0, Math.min(1, (svgX - CHART_PAD.left) / chartW));
    return Math.round(minT + frac * (maxT - minT));
  }, [domainT, chartW]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!domainT) return;
    trackCursor(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const t = pxToT(tToPx(e.clientX, rect));
    if (t !== null) setHoverT(t);
  }, [domainT, tToPx, pxToT, trackCursor]);

  // Drag-select: pointer-captured horizontal rubber-band, opt-in via
  // onRangeSelect. dragStartT/dragCurT drive the overlay rect; a move under
  // DRAG_SELECT_THRESHOLD_PX reports nothing on release (a stray click).
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartPxRef = useRef(0);
  const [dragStartT, setDragStartT] = useState<number | null>(null);
  const [dragCurT, setDragCurT] = useState<number | null>(null);
  const isDragging = dragStartT !== null;

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onRangeSelect || !domainT) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = tToPx(e.clientX, rect);
    const t = pxToT(px);
    if (t === null) return;
    dragPointerIdRef.current = e.pointerId;
    dragStartPxRef.current = px;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStartT(t);
    setDragCurT(t);
  }, [onRangeSelect, domainT, tToPx, pxToT]);

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
    }
    setDragStartT(null);
    setDragCurT(null);
  }, [dragStartT, tToPx, pxToT, onRangeSelect]);

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
        className={onRangeSelect ? `${styles.chart} ${styles.chartSelectable}` : styles.chart}
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
            <rect x={CHART_PAD.left} y={CHART_PAD.top} width={chartW} height={chartH} />
          </clipPath>
          {fillGradient && series.map(s => (
            <linearGradient key={s.id} id={`${clipId}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map((tick, i) => {
          const y = yFor(tick);
          return (
            <g key={i}>
              <line x1={CHART_PAD.left} y1={y} x2={width - CHART_PAD.right} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={CHART_PAD.left - 6} y={y + 3} fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="end">
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
            y={CHART_PAD.top}
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
                  fill={`url(#${clipId}-${s.id})`}
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

        {selectionX0 !== null && selectionX1 !== null && (
          <rect
            className={styles.dragSelection}
            x={selectionX0}
            y={CHART_PAD.top}
            width={Math.max(1, selectionX1 - selectionX0)}
            height={chartH}
          />
        )}
        </g>

        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={Math.min(Math.max(xFor(tick), CHART_PAD.left), width - CHART_PAD.right)}
            y={CHART_PAD.top + chartH + 16}
            fill="var(--text-dim)"
            fontSize="11"
            fontFamily="var(--font-mono)"
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {xTickFormat(tick)}
          </text>
        ))}

        {hoverX !== null && (
          <line x1={hoverX} y1={CHART_PAD.top} x2={hoverX} y2={CHART_PAD.top + chartH} stroke="var(--text)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        )}
      </svg>

      {tooltip && !isDragging && (
        <div ref={tooltipRef} className={styles.tooltip}>
          <div className={styles.tooltipHeader}>{formatTooltipTimestamp(tooltip.t, nowMs, language)}</div>
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
