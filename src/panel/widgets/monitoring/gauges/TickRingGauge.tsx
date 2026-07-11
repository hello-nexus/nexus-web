import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './TickRingGauge.module.scss';

const TICKS = 60;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

export function TickRingGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);
  const onCount = (clamped / 100) * TICKS;

  return (
    <div className={styles.tickRing}>
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => {
          const deg = -90 + (i / TICKS) * 360;
          const [x1, y1] = polar(47, deg);
          const [x2, y2] = polar(37, deg);
          return (
            <line
              key={i}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
              className={i < onCount ? styles.tickOn : styles.tickOff}
            />
          );
        })}
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default TickRingGauge;
