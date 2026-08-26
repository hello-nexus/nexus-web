import type { CSSProperties } from 'react';
import { normalizeShapeForPreview, type BlockCell } from './blocksLogic';
import styles from './BlocksNextPreview.module.scss';

// Every shape fits in 4x2 cells (the I piece is the widest, all are 2 tall),
// so the box is sized once and the shape is centred inside it - the swatch
// never resizes with the queued piece.
const PREVIEW_COLS = 4;
const PREVIEW_ROWS = 2;
// Fixed rather than scaled off the board's cell size: the swatch sits in the
// HUD above the board, so a board-derived size would feed back into the
// height the board is measured against.
const CELL_PX = 10;

export interface BlocksNextPreviewProps {
  blocks: BlockCell[];
}

/** Fixed-size swatch showing the upcoming piece's shape in its own color. */
export function BlocksNextPreview({ blocks }: BlocksNextPreviewProps) {
  const shape = normalizeShapeForPreview(blocks);
  const offsetX = Math.round(((PREVIEW_COLS - shape.width) * CELL_PX) / 2);
  const offsetY = Math.round(((PREVIEW_ROWS - shape.height) * CELL_PX) / 2);
  return (
    <div
      className={styles.grid}
      style={{ width: PREVIEW_COLS * CELL_PX, height: PREVIEW_ROWS * CELL_PX, '--cell': `${CELL_PX}px` } as CSSProperties}
    >
      {shape.cells.map((cell, i) => {
        const style: CSSProperties = {
          left: offsetX + cell.x * CELL_PX,
          top: offsetY + cell.y * CELL_PX,
          width: CELL_PX,
          height: CELL_PX,
        };
        return <div key={i} className={styles.cell} data-color={cell.color} style={style} />;
      })}
    </div>
  );
}
