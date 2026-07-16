import { useLayoutEffect, useRef, useState } from 'react';
import type { TimeSeriesPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import styles from './TempRibbon.module.scss';

export interface TempRibbonProps {
  /** Temperature points over the same window as the chart above it. */
  points: readonly TimeSeriesPoint[];
  /** The chart's own x-domain, so the ribbon aligns pixel-for-pixel with it. */
  domain: readonly [number, number];
  /** Color scale floor/ceiling in Celsius. */
  minC: number;
  maxC: number;
  /** Formatted current-temperature text shown at the right edge. */
  currentLabel?: string;
  height?: number;
}

const DEFAULT_HEIGHT = 12;
const MIN_OPACITY = 0.08;
const MAX_OPACITY = 0.85;

function opacityFor(avg: number, minC: number, maxC: number): number {
  const span = maxC - minC || 1;
  const frac = Math.max(0, Math.min(1, (avg - minC) / span));
  return MIN_OPACITY + frac * (MAX_OPACITY - MIN_OPACITY);
}

/**
 * A thin heat strip under the main history plot: one segment per
 * temperature point, opacity-modulated by value, so a glance at the ribbon
 * shows where the run got hot without reading the line chart. Deliberately
 * not part of TimeSeriesChart - it shares only the x-domain math, not any
 * chart internals.
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
  const xFor = (t: number) => ((t - domainStart) / span) * width;

  return (
    <div ref={wrapRef} className={styles.root} style={{ height }}>
      {width > 0 && points.length > 0 && (
        <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {points.map((p, i) => {
            const x0 = xFor(p.t);
            const x1 = i + 1 < points.length ? xFor(points[i + 1].t) : width;
            return (
              <rect
                key={p.t}
                x={x0}
                y={0}
                width={Math.max(0, x1 - x0)}
                height={height}
                fill="var(--bad)"
                fillOpacity={opacityFor(p.avg, minC, maxC)}
              />
            );
          })}
        </svg>
      )}
      {currentLabel && <span className={styles.current}>{currentLabel}</span>}
    </div>
  );
}
