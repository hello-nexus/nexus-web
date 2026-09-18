import { ArcSegments, type ArcGeometry } from './ArcSegments';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import styles from './Arc270Gauge.module.scss';

const STROKE = 9;
const RADIUS = GAUGE_FIGURE_OUTER - STROKE / 2;
// 270 deg arc starting at 7 o'clock (bottom-left) sweeping clockwise
// to 5 o'clock (bottom-right) - the bottom 90 deg is the visible gap.
const ARC_DEG = 270;
const START_DEG = 135;
const ARC_LENGTH = (ARC_DEG / 360) * 2 * Math.PI * RADIUS;

function polar(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + RADIUS * Math.cos(rad), y: 50 + RADIUS * Math.sin(rad) };
}

const start = polar(START_DEG);
const end = polar(START_DEG + ARC_DEG);
const arcPath = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;

const GEOMETRY: ArcGeometry = {
  cx: 50, cy: 50, radius: RADIUS, startDeg: START_DEG, sweepDeg: ARC_DEG, strokeWidth: STROKE,
};

export function Arc270Gauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * ARC_LENGTH;
  const gapLength = ARC_LENGTH - fillLength;

  return (
    <div className={styles.arc270}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        <path d={arcPath} className={styles.trackArc} />
        {gradient ? (
          <ArcSegments
            geometry={GEOMETRY}
            gradient={gradient}
            fillPercent={clamped}
          />
        ) : (
          <path
            d={arcPath}
            className={styles.fillArc}
            strokeDasharray={`${fillLength} ${gapLength}`}
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

export default Arc270Gauge;
