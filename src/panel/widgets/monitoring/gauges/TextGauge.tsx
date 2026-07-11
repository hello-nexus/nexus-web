import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './TextGauge.module.scss';

export function TextGauge({ formatted, label }: GaugeProps) {
  const parts = splitFormatted(formatted);
  return (
    <div className={styles.text}>
      <span className={styles.value}>
        {parts.value}
        {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
