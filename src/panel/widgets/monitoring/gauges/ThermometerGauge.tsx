import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './ThermometerGauge.module.scss';

export function ThermometerGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.thermo}>
      <div className={styles.tubeWrap}>
        <div className={styles.tube}>
          <div className={styles.fill} style={{ height: `${fillPercent}%` }} />
        </div>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default ThermometerGauge;
