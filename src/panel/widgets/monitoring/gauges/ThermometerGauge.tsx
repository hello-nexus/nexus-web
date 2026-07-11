import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './ThermometerGauge.module.scss';

export function ThermometerGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.thermo}>
      <div className={styles.tubeWrap}>
        <div className={styles.tube}>
          <div className={styles.fill} style={{ height: `${fillPercent}%` }} />
        </div>
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

export default ThermometerGauge;
