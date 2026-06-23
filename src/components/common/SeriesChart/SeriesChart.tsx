import styles from './SeriesChart.module.scss';

export interface ChartSeries {
  values: number[];
  color?: string;
  area?: boolean;
}

export interface SeriesChartProps {
  series: ChartSeries[];
  min?: number;
  max?: number;
  height?: number;
  gridlines?: boolean;
}

export function SeriesChart({ series, min: minProp, max: maxProp, height = 80, gridlines = false }: SeriesChartProps) {
  const all = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
  if (all.length < 2) return <div style={{ height }} />;
  const min = minProp ?? Math.min(...all);
  const max = maxProp ?? Math.max(...all);
  const span = max - min || 1;
  const W = 100, H = 100;
  const project = (vals: number[]) =>
    vals.map((v, i) => `${vals.length > 1 ? (i / (vals.length - 1)) * W : 0},${(H - ((v - min) / span) * H).toFixed(2)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.root} style={{ height }}>
      {gridlines && [0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} className={styles.grid} strokeWidth={0.5} vectorEffect={"non-scaling-stroke" as string} />
      ))}
      {series.map((s, si) => {
        const pts = project(s.values).join(' ');
        const color = s.color ?? 'var(--accent, currentColor)';
        return (
          <g key={si}>
            {s.area && <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity={0.15} />}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect={"non-scaling-stroke" as string} strokeLinejoin={"round" as const} />
          </g>
        );
      })}
    </svg>
  );
}
