import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './RimRingGauge.module.scss';

// Round-tile design. The ring rides the glass rim itself, so the tile renders
// full-bleed (ROUND_FULL_BLEED_DESIGNS) instead of inset into the circle's
// inscribed square - the stroke is inset by half its width so nothing clips.
const STROKE = 8;
const RADIUS = 50 - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RimRingGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className={styles.rimRing}>
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} className={styles.track} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className={styles.fill}
          strokeDasharray={`${fill.toFixed(2)} ${(CIRCUMFERENCE - fill).toFixed(2)}`}
        />
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default RimRingGauge;
