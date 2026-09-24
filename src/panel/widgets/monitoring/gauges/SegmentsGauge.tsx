import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './SegmentsGauge.module.scss';

const SEGMENTS = 16;

export function SegmentsGauge({ value, formatted, label, gradient }: GaugeProps) {
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / SEGMENTS));

  return (
    <div className={styles.segments}>
      <div className={styles.graphicWrap}>
        <div className={styles.segGroup}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <div
              key={i}
              className={i < filledCount ? styles.filled : styles.empty}
              style={i < filledCount && gradient ? { background: gaugeGradientColorAt(gradient.stops, (i + 0.5) / SEGMENTS) } : undefined}
            />
          ))}
        </div>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default SegmentsGauge;
