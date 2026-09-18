import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './HeatmapGauge.module.scss';

const CELLS = 24;
const MIN_MIX = 28;
const MAX_MIX = 100;

export function HeatmapGauge({ formatted, label, history, historyDomain, gradient }: GaugeProps) {
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
            // Graded, a cell is the gradient's colour at its own level with the
            // same opacity ramp, baked in as #rrggbbaa (no color-mix on the Q60).
            const alpha = Math.round((mix / 100) * 255).toString(16).padStart(2, '0');
            return (
              <div
                key={i}
                className={styles.cell}
                style={{
                  background: gradient
                    ? `${gaugeGradientColorAt(gradient.stops, norm)}${alpha}`
                    : `color-mix(in srgb, var(--panel-accent) ${mix}%, transparent)`,
                }}
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

export default HeatmapGauge;
