import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeBodyCss } from '../valueColor';
import styles from './FillGauge.module.scss';

// A value-fill gauge: a dim accent sweeps the whole tile left-to-right to the
// value, with the value + label riding on top. The tile-sized sibling of the
// Micro 'fill' row.
export function FillGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barStyle = gradient
    ? { width: '100%', background: gaugeBodyCss(gradient, 90), clipPath: `inset(0 ${(100 - clamped).toFixed(2)}% 0 0)` }
    : { width: `${clamped}%` };
  return (
    <div className={styles.fill}>
      <div className={styles.bar} style={barStyle} />
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default FillGauge;
