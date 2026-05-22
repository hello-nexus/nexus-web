import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './BarGauge.module.scss';

export function BarGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.bar}>
      <div className={styles.trackWrap}>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
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
