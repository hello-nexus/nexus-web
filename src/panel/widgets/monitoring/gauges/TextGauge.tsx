import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './TextGauge.module.scss';

export function TextGauge({ formatted, label }: GaugeProps) {
  return (
    <div className={styles.text}>
      <GaugeValue formatted={formatted} className={styles.value} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
