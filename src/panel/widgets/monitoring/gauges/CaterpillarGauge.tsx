import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import { ArcSegments, type ArcGeometry } from './ArcSegments';
import styles from './CaterpillarGauge.module.scss';

const STROKE = 9;
// Centre line of a stroke whose outer edge lands on the shared figure edge.
const RADIUS = GAUGE_FIGURE_OUTER - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// The graded ring starts at 12 o'clock like the dash below.
const GEOMETRY: ArcGeometry = { cx: 50, cy: 50, radius: RADIUS, startDeg: -90, sweepDeg: 360, strokeWidth: STROKE };

export function CaterpillarGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * CIRCUMFERENCE;
  const gapLength = CIRCUMFERENCE - fillLength;

  return (
    <div className={styles.caterpillar}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={RADIUS} className={styles.trackRing} />
        {gradient ? (
          <ArcSegments geometry={GEOMETRY} gradient={gradient} fillPercent={clamped} />
        ) : (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            className={styles.fillRing}
            strokeDasharray={`${fillLength} ${gapLength}`}
            // Start the dash at 12 o'clock and sweep clockwise.
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
