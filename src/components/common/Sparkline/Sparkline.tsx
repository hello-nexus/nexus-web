import { useMemo, type CSSProperties } from 'react';
import styles from './Sparkline.module.scss';

interface SparklineProps {
  /** Most-recent-last array of numeric samples (any range; component normalizes). */
  values: number[];
  /** Width in CSS pixels or CSS width. Default 64. */
  width?: number | string;
  /** Numeric drawing width used when width is fluid. */
  viewWidth?: number;
  /** Height in CSS pixels. Default 22. */
  height?: number;
  /** Stroke + fill color. Default uses --accent. */
  color?: string;
  /** Optional stroke-only override. Fill keeps using color. */
  strokeColor?: string;
  /** Line width in SVG units. */
  strokeWidth?: number;
  /** Fixed number of samples to draw; short histories are left-padded so newest samples start on the right. */
  sampleCount?: number;
  /** Fixed scale, e.g. [0, 100] for percentages. Auto-scales if omitted. */
  domain?: [number, number];
  /** Inner y-axis padding in SVG units. */
  padding?: number;
  /** Render an area fill under the line. */
  showFill?: boolean;
  /** Alpha for the flat area fill. */
  fillOpacity?: number;
  /** Silhouette mode: fill only, no stroke line. Bumps fillOpacity to the
   *  seek-bar silhouette weight unless the caller overrides it explicitly. */
  fillOnly?: boolean;
  className?: string;
  style?: CSSProperties;
}

const FILL_ONLY_OPACITY = 0.25;

/**
 * Tiny SVG sparkline. No external charting lib - pure path math, ~1KB.
 * Suited for the header mini-graphs (CPU/MEM/GPU) and any inline metric.
 */
export function Sparkline({
  values,
  width = 64,
  viewWidth,
  height = 22,
  color = 'var(--accent)',
  strokeColor,
  strokeWidth = 1.5,
  sampleCount,
  domain,
  padding = 0,
  showFill = true,
  fillOpacity,
  fillOnly = false,
  className,
  style,
}: SparklineProps) {
  const resolvedFillOpacity = fillOpacity ?? (fillOnly ? FILL_ONLY_OPACITY : 0.4);
  const samples = useMemo(() => {
    if (!sampleCount || sampleCount <= 0) return values;
    const tail = values.slice(-sampleCount);
    if (tail.length >= sampleCount) return tail;
    return [...new Array(sampleCount - tail.length).fill(0), ...tail];
  }, [values, sampleCount]);

  const svgWidth = typeof width === 'number' ? width : (viewWidth ?? Math.max(1, samples.length - 1));
  const renderedWidth = width;
  const classes = className ? `${styles.sparkline} ${className}` : styles.sparkline;

  const { linePath, fillPath } = useMemo(() => {
    if (samples.length === 0) {
      return { linePath: '', fillPath: '' };
    }

    const [min, max] = domain ?? [
      Math.min(...samples),
      Math.max(...samples),
    ];
    const range = max - min || 1;
    const stepX = samples.length > 1 ? svgWidth / (samples.length - 1) : 0;
    const usableHeight = Math.max(1, height - padding * 2);

    const points = samples.map((v, i) => {
      const x = i * stepX;
      // A user-set Fixed-range min/max can sit inside the sample range, so
      // clamp: an out-of-domain sample draws pinned to the floor/ceiling
      // instead of escaping the chart's drawable height.
      const normalized = Math.max(0, Math.min(1, (v - min) / range));
      const y = height - padding - normalized * usableHeight;
      return [x, y] as const;
    });

    const line = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');

    const fill = `${line} L${svgWidth.toFixed(2)},${height} L0,${height} Z`;

    return { linePath: line, fillPath: fill };
  }, [samples, svgWidth, height, domain, padding]);

  if (!linePath) {
    return <svg className={classes} width={renderedWidth} height={height} style={style} aria-hidden="true" />;
  }

  return (
    <svg
      className={classes}
      width={renderedWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      preserveAspectRatio="none"
      style={style}
      aria-hidden="true"
    >
      {showFill && <path d={fillPath} fill={color} fillOpacity={resolvedFillOpacity} />}
      {!fillOnly && (
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor ?? color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
