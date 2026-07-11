import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './BatteryGauge.module.scss';

export function BatteryGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.battery}>
      <div className={styles.shellWrap}>
        <div className={styles.shell}>
          <div className={styles.fill} style={{ width: `${fillPercent}%` }} />
        </div>
        <div className={styles.cap} />
      </div>
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

export default BatteryGauge;
