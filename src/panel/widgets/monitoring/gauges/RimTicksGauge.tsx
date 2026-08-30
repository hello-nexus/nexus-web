import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './RimTicksGauge.module.scss';

// Round-tile design: a dense tick collar on the glass rim, lit clockwise from
// 12 o'clock. Full-bleed (ROUND_FULL_BLEED_DESIGNS) - the outer end of each
// tick sits half a stroke inside the edge so the caps are not clipped.
const TICKS = 72;
const OUTER = 48.5;
const INNER = 40;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

export function RimTicksGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const onCount = (clamped / 100) * TICKS;

  return (
    <div className={styles.rimTicks}>
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

export default RimTicksGauge;
