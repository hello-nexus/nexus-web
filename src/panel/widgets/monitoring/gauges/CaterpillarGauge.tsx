import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './CaterpillarGauge.module.scss';

const RADIUS = 38;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CaterpillarGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * CIRCUMFERENCE;
  const gapLength = CIRCUMFERENCE - fillLength;
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.caterpillar}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={RADIUS} className={styles.trackRing} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className={styles.fillRing}
          strokeDasharray={`${fillLength} ${gapLength}`}
          // Start the dash at 12 o'clock and sweep clockwise.
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
