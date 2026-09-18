import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './TickRingGauge.module.scss';

const TICKS = 60;
const STROKE = 2.8;
const OUTER = GAUGE_FIGURE_OUTER - STROKE / 2;
const INNER = OUTER - 10;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

export function TickRingGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const onCount = (clamped / 100) * TICKS;

  return (
    <div className={styles.tickRing}>
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => {
          const deg = -90 + (i / TICKS) * 360;
          const [x1, y1] = polar(OUTER, deg);
          const [x2, y2] = polar(INNER, deg);
          return (
            <line
              key={i}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
              className={i < onCount ? styles.tickOn : styles.tickOff}
              style={i < onCount && gradient ? { stroke: gaugeGradientColorAt(gradient.stops, (i + 0.5) / TICKS) } : undefined}
            />
          );
        })}
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default TickRingGauge;
