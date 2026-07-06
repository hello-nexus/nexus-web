import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './HalfGaugeGauge.module.scss';

export function HalfGaugeGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  const radius = 40;
  const cx = 50;
  const cy = 50;
  const circumference = Math.PI * radius;
  const fillLength = (clamped / 100) * circumference;
  const gapLength = circumference - fillLength;

  // Dot at the fill tip. The arc sweeps 180deg (left -> top -> right), so the
  // angle at fraction f is pi*(1-f); y grows downward in SVG.
  const tipAngle = Math.PI * (1 - clamped / 100);
  const dotX = cx + radius * Math.cos(tipAngle);
  const dotY = cy - radius * Math.sin(tipAngle);

  return (
    <div className={styles.halfGauge}>
      <div className={styles.arcWrap}>
        <svg className={styles.svg} viewBox="0 0 100 56">
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            className={styles.trackArc}
          />
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            className={styles.fillArc}
            strokeDasharray={`${fillLength} ${gapLength}`}
          />
          <circle cx={dotX} cy={dotY} r={6} className={styles.fillDot} />
        </svg>
      </div>
      <div className={styles.info}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}

export default HalfGaugeGauge;
