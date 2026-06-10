import { splitFormatted } from './format';
import { GaugeTrack } from './GaugeTrack';
import type { GaugeProps } from './types';
import styles from './BarGauge.module.scss';

export function BarGauge({ value, formatted, label }: GaugeProps) {
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.bar}>
      <div className={styles.trackWrap}>
        <GaugeTrack fillPercent={value} />
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
