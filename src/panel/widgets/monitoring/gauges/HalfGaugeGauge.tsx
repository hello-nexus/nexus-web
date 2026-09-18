import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { ArcSegments, type ArcGeometry } from './ArcSegments';
import styles from './HalfGaugeGauge.module.scss';

const RADIUS = 40;
const CX = 50;
const CY = 50;
const GEOMETRY: ArcGeometry = { cx: CX, cy: CY, radius: RADIUS, startDeg: 180, sweepDeg: 180, strokeWidth: 9 };

export function HalfGaugeGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const radius = RADIUS;
  const cx = CX;
  const cy = CY;
  const circumference = Math.PI * radius;
  const fillLength = (clamped / 100) * circumference;
  const gapLength = circumference - fillLength;

  return (
    <div className={styles.halfGauge}>
      <div className={styles.arcWrap}>
        <svg className={styles.svg} viewBox="0 0 100 56">
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            className={styles.trackArc}
          />
          {gradient ? (
            <ArcSegments geometry={GEOMETRY} gradient={gradient} fillPercent={clamped} />
          ) : (
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              className={styles.fillArc}
              strokeDasharray={`${fillLength} ${gapLength}`}
            />
          )}
        </svg>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default HalfGaugeGauge;
