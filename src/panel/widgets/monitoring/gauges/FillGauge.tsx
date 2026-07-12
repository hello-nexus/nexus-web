import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './FillGauge.module.scss';

// A value-fill gauge: a dim accent sweeps the whole tile left-to-right to the
// value, with the value + label riding on top. The tile-sized sibling of the
// Micro 'fill' row.
export function FillGauge({ value, formatted, label }: GaugeProps) {
  const parts = splitFormatted(formatted);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.fill}>
      <div className={styles.bar} style={{ width: `${clamped}%` }} />
      <div className={styles.info}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default FillGauge;
