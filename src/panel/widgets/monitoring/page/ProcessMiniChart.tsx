import { buildMiniChart } from './processDetailHelpers';
import type { AppWindowPoint } from '../../../../api/monitoringHistoryApps';
import styles from './ProcessDetailSlideout.module.scss';

// Fixed internal drawing width for the path math - the SVG itself renders
// fluid (width 100%, preserveAspectRatio="none") the same way Sparkline's
// viewBox trick does, so no ResizeObserver is needed to track the slideout's
// actual pixel width.
const DRAW_WIDTH = 400;
const HEIGHT = 56;

export function ProcessMiniChart({ points }: { points: readonly AppWindowPoint[] }) {
  const { segments, hasData } = buildMiniChart(points, DRAW_WIDTH, HEIGHT);

  if (!hasData) return null;

  return (
    <svg
      className={styles.miniChart}
      viewBox={`0 0 ${DRAW_WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      width="100%"
      height={HEIGHT}
      aria-hidden="true"
    >
      {segments.map((segment, i) => (
        <path key={i} d={segment.fillPath} fill="var(--accent)" fillOpacity={0.25} />
      ))}
    </svg>
  );
}
