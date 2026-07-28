import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './HbarGauge.module.scss';

const SEGMENTS = 10;

export function HbarGauge({ value, formatted, label }: GaugeProps) {
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / SEGMENTS));

  return (
    <div className={styles.hbar}>
      <div className={styles.stackWrap}>
        <div className={styles.stack}>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const fromBottom = SEGMENTS - 1 - i;
            return (
              <div
                key={i}
                className={fromBottom < filledCount ? styles.filled : styles.empty}
              />
            );
          })}
        </div>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default HbarGauge;
