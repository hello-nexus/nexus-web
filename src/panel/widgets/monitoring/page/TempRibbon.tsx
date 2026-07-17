import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Thermometer } from 'lucide-react';
import type { TimeSeriesPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import { CHART_PAD } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import styles from './TempRibbon.module.scss';

export interface TempRibbonProps {
  /** Temperature points over the same window as the chart above it. */
  points: readonly TimeSeriesPoint[];
  /** The chart's own x-domain. Combined with CHART_PAD (same left/right inset
   *  as the chart above), the ribbon's segments land pixel-for-pixel under
   *  the chart's plotted points, given the same container width. */
  domain: readonly [number, number];
  /** Formatted current-temperature text shown beside the ribbon (never over
   *  its drawn segments), with a thermometer icon. */
  currentLabel?: string;
  height?: number;
}

const DEFAULT_HEIGHT = 12;
// Thickness floor/ceiling, px - the band never fully disappears at the cold
// end of the observed window and never exceeds the ribbon's own height at
// the hot end.
const MIN_THICKNESS = 1.5;
// Reserved lane for the current-value label so it sits beside the ribbon on
// the same line without overlapping the drawn band - same reserved-lane
// pattern TimelineBrush uses for its own docked edge labels. Carved out via
// an SVG clip rather than shrinking plotWidth: shrinking the scale itself
// would desync every point's x position from the chart above (a growing
// offset across the whole window, not just the reserved corner) - clipping
// keeps every visible point's x identical to the chart's, only hiding the
// last sliver of window behind the label.
const LABEL_RESERVE_PX = 56;

function thicknessFor(avg: number, minC: number, maxC: number, maxThickness: number): number {
  const span = maxC - minC || 1;
  const frac = Math.max(0, Math.min(1, (avg - minC) / span));
  return MIN_THICKNESS + frac * (maxThickness - MIN_THICKNESS);
}

/** The observed [min, max] across `points`' avg values, or [0, 1] for an
 *  empty window (thicknessFor's span-or-1 guard then renders everything at
 *  a flat mid thickness). */
function observedRange(points: readonly TimeSeriesPoint[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.avg < min) min = p.avg;
    if (p.avg > max) max = p.avg;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  return [min, max];
}

/**
 * A thin heat strip under the main history plot: one segment per
 * temperature point, THICKNESS-modulated by value (thicker where hotter,
 * thinner where cooler - a waveform, not an opacity/color gradient), so a
 * glance at the ribbon shows where the run got hot without reading the line
 * chart. Thickness is normalized against the CURRENT WINDOW's own observed
 * min/max rather than a fixed physical temperature range: the ribbon is
 * deliberately a relative "how did this window vary" read, not an absolute
 * gauge, so a narrow real-world band (e.g. an idle system sitting at
 * 40-45C) still shows a clearly visible swing instead of a nearly-flat
 * line lost inside a wide fixed scale. A perfectly flat window (every point
 * equal) renders at the floor thickness uniformly - there is no variation
 * to show.
 * Deliberately not part of TimeSeriesChart - it shares only the x-domain
 * math and the CHART_PAD inset (so its segments land under the chart's plot
 * rect, not the legend/axis margins), not any other chart internals. The
 * current-value label renders beside the strip on the same line, in a
 * reserved lane that never overlaps its drawn segments.
 */
export function TempRibbon({ points, domain, currentLabel, height = DEFAULT_HEIGHT }: TempRibbonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const clipId = `temp-ribbon-${useId().replace(/:/g, '')}`;

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

  const [domainStart, domainEnd] = domain;
  const span = domainEnd - domainStart || 1;
  // Unreserved - identical to how TimeSeriesChart computes its own plot
  // width, so a point at time t lands at the exact same x here as it does
  // in the chart above.
  const plotWidth = Math.max(1, width - CHART_PAD.left - CHART_PAD.right);
  const xFor = (t: number) => CHART_PAD.left + ((t - domainStart) / span) * plotWidth;
  const midY = height / 2;
  const [minC, maxC] = observedRange(points);
  const labelReserve = currentLabel ? LABEL_RESERVE_PX : 0;
  const clipWidth = Math.max(0, plotWidth - labelReserve);

  return (
    <div ref={wrapRef} className={styles.root} style={{ height }}>
      <div className={styles.track} style={{ height }}>
        {width > 0 && points.length > 0 && (
          <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
              <clipPath id={clipId}>
                <rect x={CHART_PAD.left} y={0} width={clipWidth} height={height} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {points.map((p, i) => {
                const x0 = xFor(p.t);
                const x1 = i + 1 < points.length ? xFor(points[i + 1].t) : CHART_PAD.left + plotWidth;
                const thickness = thicknessFor(p.avg, minC, maxC, height);
                return (
                  <rect
                    key={p.t}
                    x={x0}
                    y={midY - thickness / 2}
                    width={Math.max(0, x1 - x0)}
                    height={thickness}
                    fill="var(--bad)"
                  />
                );
              })}
            </g>
          </svg>
        )}
      </div>
      {currentLabel && (
        <span className={styles.current}>
          <Thermometer size={11} aria-hidden />
          {currentLabel}
        </span>
      )}
    </div>
  );
}
