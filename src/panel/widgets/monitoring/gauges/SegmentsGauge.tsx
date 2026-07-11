import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './SegmentsGauge.module.scss';

const SEGMENTS = 16;

export function SegmentsGauge({ value, formatted, label }: GaugeProps) {
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / SEGMENTS));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.segments}>
      <div className={styles.graphicWrap}>
        <div className={styles.segGroup}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <div key={i} className={i < filledCount ? styles.filled : styles.empty} />
          ))}
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

export default SegmentsGauge;
