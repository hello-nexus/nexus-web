import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './RimArcGauge.module.scss';

// Round-tile design: a 300 deg band on the glass rim with a 60 deg gap at the
// bottom, where the caption sits. Full-bleed (ROUND_FULL_BLEED_DESIGNS).
const STROKE = 8;
const RADIUS = 50 - STROKE / 2;
const ARC_DEG = 300;
// 120 deg is 7 o'clock in SVG's clockwise-from-3-o'clock frame; sweeping 300
// lands at 5 o'clock, centring the gap on the bottom.
const START_DEG = 120;
const ARC_LENGTH = (ARC_DEG / 360) * 2 * Math.PI * RADIUS;

function polar(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: 50 + RADIUS * Math.cos(rad), y: 50 + RADIUS * Math.sin(rad) };
}

const start = polar(START_DEG);
const end = polar(START_DEG + ARC_DEG);
const arcPath = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;

export function RimArcGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * ARC_LENGTH;

  return (
    <div className={styles.rimArc}>
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        <path d={arcPath} className={styles.track} />
        <path
          d={arcPath}
          className={styles.fill}
          strokeDasharray={`${fillLength.toFixed(2)} ${(ARC_LENGTH - fillLength).toFixed(2)}`}
        />
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export default RimArcGauge;
