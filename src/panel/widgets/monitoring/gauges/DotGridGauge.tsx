import { useLayoutEffect, useRef, useState } from 'react';
import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './DotGridGauge.module.scss';

const DOT = 10;
const GAP = 4;
const CELL = DOT + GAP;
// Baseline grid; columns/rows expand to fill wider or taller tiles
// (4x2 / 4x4), never fewer than the baseline.
const BASE_COLS = 9;
const BASE_ROWS = 5;

export function DotGridGauge({ value, formatted, label }: GaugeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: BASE_COLS, rows: BASE_ROWS });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const cols = Math.max(BASE_COLS, Math.floor((w + GAP) / CELL));
      const rows = Math.max(BASE_ROWS, Math.floor((h + GAP) / CELL));
      setGrid(prev => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = grid.cols * grid.rows;
  const filledCount = Math.round(Math.max(0, Math.min(100, value)) / (100 / total));
  const parts = splitFormatted(formatted);

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
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default DotGridGauge;
