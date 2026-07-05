import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './WaffleGauge.module.scss';

const COLS = 5;
const ROWS = 5;
const TOTAL = COLS * ROWS;

export function WaffleGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * TOTAL);
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.waffle}>
      <div className={styles.gridWrap}>
        <div className={styles.grid}>
          {Array.from({ length: TOTAL }, (_, idx) => {
            const row = Math.floor(idx / COLS);
            const col = idx % COLS;
            const rankFromBottom = (ROWS - 1 - row) * COLS + col;
            return <div key={idx} className={rankFromBottom < filled ? styles.cellOn : styles.cellOff} />;
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

export default WaffleGauge;
