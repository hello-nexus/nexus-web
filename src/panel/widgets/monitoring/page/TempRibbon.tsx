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
  height?: number;
  /** Absolute thickness-scale floor (near-zero thickness at/below this
   *  temperature) - see metricHistoryHelpers.ts's TEMP_RIBBON_FLOOR_C. */
  floorC: number;
  /** Absolute thickness-scale ceiling (full ribbon thickness at/above this
   *  temperature), per hardware kind - see metricHistoryHelpers.ts's
   *  CPU_TEMP_RIBBON_CAP_C / GPU_TEMP_RIBBON_CAP_C. */
  capC: number;
}

const DEFAULT_HEIGHT = 12;
// Thickness floor/ceiling, px - the band never fully disappears below floorC
// and never exceeds the ribbon's own height at/above capC.
const MIN_THICKNESS = 1.5;

function thicknessFor(avg: number, floorC: number, capC: number, maxThickness: number): number {
  const span = capC - floorC || 1;
  const frac = Math.max(0, Math.min(1, (avg - floorC) / span));
  return MIN_THICKNESS + frac * (maxThickness - MIN_THICKNESS);
}

/**
 * A thin heat strip under the main history plot: one segment per
 * temperature point, THICKNESS-modulated by value (thicker where hotter,
 * thinner where cooler - a waveform, not an opacity/color gradient), so a
 * glance at the ribbon shows where the run got hot without reading the line
 * chart. Thickness is normalized against a fixed [floorC, capC] range, not
 * the current window's own observed min/max - the same window always reads
 * the same way no matter which stretch of history is scrubbed into view, so
 * the ribbon is a predictable gauge rather than a relative "how did this
 * window vary" shape that could show the same visual swing for an idle
 * system and a thermal-limited one.
 * No numeric readout - the icon is purely a label for the row (the value
 * itself lives only in the hero chart's hover tooltip, on the same row as
 * the timestamp). The icon sits inside the CHART_PAD.left lane (the same
 * lane the chart's own y-axis tick labels occupy), positioned absolutely so
 * it never consumes flow width - the band's drawn x-range is therefore
 * exactly [CHART_PAD.left, width - CHART_PAD.right], pixel-identical to the
 * chart's own plot rect for the same container width, with no reserved
 * lane to desync it.
 * Deliberately not part of TimeSeriesChart - it shares only the x-domain
 * math and the CHART_PAD inset, not any other chart internals.
 */
export function TempRibbon({ points, domain, height = DEFAULT_HEIGHT, floorC, capC }: TempRibbonProps) {
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
    <div ref={wrapRef} className={styles.root} style={{ height }}>
      <span className={styles.icon}>
        <Thermometer size={11} aria-hidden />
      </span>
      <div className={styles.track} style={{ height }}>
        {width > 0 && points.length > 0 && (
          <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {points.map((p, i) => {
              const x0 = xFor(p.t);
              const x1 = i + 1 < points.length ? xFor(points[i + 1].t) : CHART_PAD.left + plotWidth;
              const thickness = thicknessFor(p.avg, floorC, capC, height);
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
    </div>
  );
}
