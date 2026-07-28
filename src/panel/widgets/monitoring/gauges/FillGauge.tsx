import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './FillGauge.module.scss';

// A value-fill gauge: a dim accent sweeps the whole tile left-to-right to the
// value, with the value + label riding on top. The tile-sized sibling of the
// Micro 'fill' row.
export function FillGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.fill}>
      <div className={styles.bar} style={{ width: `${clamped}%` }} />
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default FillGauge;
