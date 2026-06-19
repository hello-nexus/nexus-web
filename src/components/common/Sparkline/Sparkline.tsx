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
  className?: string;
  style?: CSSProperties;
}

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
  fillOpacity = 0.4,
  className,
  style,
}: SparklineProps) {
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
      const normalized = (v - min) / range;
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
      {showFill && <path d={fillPath} fill={color} fillOpacity={fillOpacity} />}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor ?? color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
