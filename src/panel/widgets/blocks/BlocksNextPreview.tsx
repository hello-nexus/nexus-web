import type { CSSProperties } from 'react';
import { normalizeShapeForPreview, type BlockCell } from './blocksLogic';
import styles from './BlocksNextPreview.module.scss';

export interface BlocksNextPreviewProps {
  blocks: BlockCell[];
  label: string;
  // Mini-cell size (px); scaled off the board's own cellSize by the caller so
  // the swatch tracks the board across viewports instead of a fixed size.
  cellPx: number;
}

/** Small swatch showing the upcoming piece's shape in its own color. */
export function BlocksNextPreview({ blocks, label, cellPx }: BlocksNextPreviewProps) {
  const shape = normalizeShapeForPreview(blocks);
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{label}</span>
      <div
        className={styles.grid}
        style={{ width: shape.width * cellPx, height: shape.height * cellPx, '--cell': `${cellPx}px` } as CSSProperties}
      >
        {shape.cells.map((cell, i) => {
          const style: CSSProperties = { left: cell.x * cellPx, top: cell.y * cellPx, width: cellPx, height: cellPx };
          return <div key={i} className={styles.cell} data-color={cell.color} style={style} />;
        })}
      </div>
    </div>
  );
}
