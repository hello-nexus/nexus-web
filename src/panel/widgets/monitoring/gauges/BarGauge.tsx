import { GaugeTrack } from './GaugeTrack';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './BarGauge.module.scss';

export function BarGauge({ value, formatted, label, gradient }: GaugeProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.trackWrap}>
        <GaugeTrack fillPercent={value} gradient={gradient} />
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
