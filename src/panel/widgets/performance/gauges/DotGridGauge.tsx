import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './DotGridGauge.module.scss';

const COLS = 5;
const ROWS = 5;
const TOTAL = COLS * ROWS;

export function DotGridGauge({ value, formatted, label }: GaugeProps) {
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / TOTAL));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.dotGrid}>
      <div className={styles.gridWrap}>
        <div className={styles.grid}>
          {Array.from({ length: TOTAL }, (_, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            // Fill from bottom row first, left-to-right within each row.
            const fromBottom = (ROWS - 1 - row) * COLS + col;
            const filled = fromBottom < filledCount;
            return (
              <div
                key={i}
                className={filled ? styles.dotFilled : styles.dotEmpty}
              />
            );
          })}
        </div>
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

export default DotGridGauge;
