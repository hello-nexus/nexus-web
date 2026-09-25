import { useLayoutEffect, useRef, useState } from 'react';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './DotGridGauge.module.scss';

const DOT = 10;
const GAP = 4;
const CELL = DOT + GAP;
// Grid before the first measure; after it, columns/rows are however many dots
// the tile fits, so a short cell gets fewer rows instead of cropping them.
const BASE_COLS = 9;
const BASE_ROWS = 5;

export function DotGridGauge({ value, formatted, label, gradient }: GaugeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: BASE_COLS, rows: BASE_ROWS });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const cols = Math.max(1, Math.floor((w + GAP) / CELL));
      const rows = Math.max(1, Math.floor((h + GAP) / CELL));
      setGrid(prev => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = grid.cols * grid.rows;
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / total));

  return (
    <div className={styles.dotGrid}>
      <div className={styles.gridWrap} ref={wrapRef}>
        <div
          className={styles.grid}
          style={{
            // Dot size + gap flow to the SCSS as vars so the measured cell
            // size (CELL) and the rendered dots stay from one source.
            ['--dg-dot' as string]: `${DOT}px`,
            ['--dg-gap' as string]: `${GAP}px`,
            gridTemplateColumns: `repeat(${grid.cols}, var(--dg-dot))`,
          }}
        >
          {Array.from({ length: total }, (_, i) => {
            const row = Math.floor(i / grid.cols);
            const col = i % grid.cols;
            // Fill from bottom row first, left-to-right within each row.
            const fromBottom = (grid.rows - 1 - row) * grid.cols + col;
            const filled = fromBottom < filledCount;
            return (
              <div
                key={i}
                className={filled ? styles.dotFilled : styles.dotEmpty}
                style={filled && gradient ? { background: gaugeGradientColorAt(gradient.stops, (fromBottom + 0.5) / total) } : undefined}
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

export default DotGridGauge;
