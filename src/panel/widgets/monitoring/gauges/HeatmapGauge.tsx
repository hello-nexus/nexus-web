import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './HeatmapGauge.module.scss';

const CELLS = 24;
const MIN_MIX = 28;
const MAX_MIX = 100;

export function HeatmapGauge({ formatted, label, history, historyDomain }: GaugeProps) {
  const parts = splitFormatted(formatted);

  const tail = history.slice(-CELLS);
  const cells = tail.length >= CELLS ? tail : [...new Array(CELLS - tail.length).fill(0), ...tail];

  const [min, max] = historyDomain;
  const range = max - min || 1;

  return (
    <div className={styles.heatmap}>
      <div className={styles.graphicWrap}>
        <div className={styles.cellGroup}>
          {cells.map((v, i) => {
            const norm = Math.max(0, Math.min(1, (v - min) / range));
            const mix = MIN_MIX + norm * (MAX_MIX - MIN_MIX);
            return (
              <div
                key={i}
                className={styles.cell}
                style={{ background: `color-mix(in srgb, var(--panel-accent) ${mix}%, transparent)` }}
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

export default HeatmapGauge;
