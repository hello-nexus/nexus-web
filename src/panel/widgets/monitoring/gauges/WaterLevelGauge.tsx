import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './WaterLevelGauge.module.scss';

export function WaterLevelGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.water}>
      <div className={styles.container}>
        <div
          className={styles.fill}
          style={{ height: `${fillPercent}%` }}
        />
      </div>
      <div className={styles.overlay}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
