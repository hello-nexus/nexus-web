import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './WaterLevelGauge.module.scss';

export function WaterLevelGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.water}>
      <div className={styles.container}>
        <div
          className={styles.fill}
          style={{ height: `${fillPercent}%` }}
        />
      </div>
      <div className={styles.overlay}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
