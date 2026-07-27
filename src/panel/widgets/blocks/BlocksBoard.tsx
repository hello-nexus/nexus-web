import type { CSSProperties } from 'react';
import { type Board, type BlockCell, type ComboJuiceTier } from './blocksLogic';
import styles from './BlocksBoard.module.scss';

export interface BlocksBoardProps {
  board: Board;
  // Falling piece cells, already offset to absolute board coordinates.
  fallingBlocks: BlockCell[];
  comboTier: ComboJuiceTier;
  boardLabel: string;
  // Measured by the caller (BlocksTouch also needs cellSize for its drag
  // gesture thresholds, so the scale hook is owned one level up).
  cellSize: number;
  boardBoxRef: (el: HTMLDivElement | null) => void;
  boardWidthCells: number;
  boardHeightCells: number;
  // A single Pointer Events entry point (not parallel touch + mouse
  // handlers) - see BlocksTouch.handlePointerDown for why.
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function BlocksBoard({
  board, fallingBlocks, comboTier, boardLabel, cellSize, boardBoxRef, boardWidthCells, boardHeightCells,
  onPointerDown, onKeyDown,
}: BlocksBoardProps) {
  return (
    <div
      ref={boardBoxRef}
      className={styles.box}
      role="application"
      aria-label={boardLabel}
      tabIndex={0}
      data-combo-tier={comboTier > 0 ? comboTier : undefined}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      {cellSize > 0 && (
        <div
          className={styles.board}
          style={{ width: cellSize * boardWidthCells, height: cellSize * boardHeightCells }}
        >
          {board.map((row, y) => row.map((color, x) => {
            if (!color) return null;
            const style: CSSProperties = { left: x * cellSize, top: y * cellSize, width: cellSize, height: cellSize };
            return <div key={`${x}-${y}`} className={styles.cell} data-color={color} style={style} />;
          }))}
          {fallingBlocks.map((block, i) => {
            const style: CSSProperties = { left: block.x * cellSize, top: block.y * cellSize, width: cellSize, height: cellSize };
            return <div key={i} className={styles.cell} data-color={block.color} style={style} />;
          })}
        </div>
      )}
    </div>
  );
}
