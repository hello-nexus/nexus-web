import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './BatteryGauge.module.scss';

export function BatteryGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.battery}>
      <div className={styles.shellWrap}>
        <div className={styles.shell}>
          <div className={styles.fill} style={{ width: `${fillPercent}%` }} />
        </div>
        <div className={styles.cap} />
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default BatteryGauge;
