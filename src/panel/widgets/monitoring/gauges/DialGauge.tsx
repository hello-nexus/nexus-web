import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './DialGauge.module.scss';

const START = 135;
const SWEEP = 270;
const TICKS = 19;
const STROKE = 2.6;
const TICK_OUTER = GAUGE_FIGURE_OUTER - STROKE / 2;
// Radius the dial's other features were drawn against before normalization.
const DESIGNED_TICK_OUTER = 43;
const SCALE = TICK_OUTER / DESIGNED_TICK_OUTER;
const TICK_INNER = 36 * SCALE;
const NEEDLE = 33 * SCALE;
const HUB = 4.5 * SCALE;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

export function DialGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const [nx, ny] = polar(NEEDLE, START + (clamped / 100) * SWEEP);
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const deg = START + (i / (TICKS - 1)) * SWEEP;
    const [x1, y1] = polar(TICK_OUTER, deg);
    const [x2, y2] = polar(TICK_INNER, deg);
    return { x1, y1, x2, y2, on: i / (TICKS - 1) <= clamped / 100 + 1e-9 };
  });

  return (
    <div className={styles.dial}>
      <div className={styles.svgWrap}>
        <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1.toFixed(2)}
              y1={t.y1.toFixed(2)}
              x2={t.x2.toFixed(2)}
              y2={t.y2.toFixed(2)}
              className={t.on ? styles.tickOn : styles.tickOff}
              style={t.on && gradient ? { stroke: gaugeGradientColorAt(gradient.stops, i / (TICKS - 1)) } : undefined}
            />
          ))}
          <line x1="50" y1="50" x2={nx.toFixed(2)} y2={ny.toFixed(2)} className={styles.needle} />
          <circle cx="50" cy="50" r={HUB.toFixed(2)} className={styles.hub} />
        </svg>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default DialGauge;
