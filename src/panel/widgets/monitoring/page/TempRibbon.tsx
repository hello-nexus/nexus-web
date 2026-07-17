import { useLayoutEffect, useRef, useState } from 'react';
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
  /** Color scale floor/ceiling in Celsius. */
  minC: number;
  maxC: number;
  /** Formatted current-temperature text shown below the ribbon (never over
   *  its drawn segments), with a thermometer icon. */
  currentLabel?: string;
  height?: number;
}

const DEFAULT_HEIGHT = 12;
// Thickness floor/ceiling, px - the band never fully disappears at the cold
// end and never exceeds the ribbon's own height at the hot end.
const MIN_THICKNESS = 1.5;

function thicknessFor(avg: number, minC: number, maxC: number, maxThickness: number): number {
  const span = maxC - minC || 1;
  const frac = Math.max(0, Math.min(1, (avg - minC) / span));
  return MIN_THICKNESS + frac * (maxThickness - MIN_THICKNESS);
}

/**
 * A thin heat strip under the main history plot: one segment per
 * temperature point, THICKNESS-modulated by value (thicker where hotter,
 * thinner where cooler - a waveform, not an opacity/color gradient), so a
 * glance at the ribbon shows where the run got hot without reading the line
 * chart. Deliberately not part of TimeSeriesChart - it shares only the
 * x-domain math and the CHART_PAD inset (so its segments land under the
 * chart's plot rect, not the legend/axis margins), not any other chart
 * internals. The current-value label renders below the strip, never over
 * its drawn segments.
 */
export function TempRibbon({ points, domain, minC, maxC, currentLabel, height = DEFAULT_HEIGHT }: TempRibbonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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
  const plotWidth = Math.max(1, width - CHART_PAD.left - CHART_PAD.right);
  const xFor = (t: number) => CHART_PAD.left + ((t - domainStart) / span) * plotWidth;
  const midY = height / 2;

  return (
    <div className={styles.root}>
      <div ref={wrapRef} className={styles.plot} style={{ height }}>
        {width > 0 && points.length > 0 && (
          <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
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
