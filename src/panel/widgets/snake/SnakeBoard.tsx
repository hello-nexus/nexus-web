import type { CSSProperties } from 'react';
import { GRID_COLS, GRID_ROWS, type SnakeState } from './snakeLogic';
import { useGameBoardScale } from '../games-shared/useGameBoardScale';
import styles from './SnakeBoard.module.scss';

// Tail segments fade toward this floor so a long snake stays legible instead
// of blending into a solid block.
const TAIL_FADE_STEP = 0.08;
const TAIL_FADE_FLOOR = 0.5;

export interface SnakeBoardProps {
  state: SnakeState;
  boardLabel: string;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function SnakeBoard({ state, boardLabel, onTouchStart, onTouchEnd, onMouseDown, onMouseUp, onMouseLeave, onKeyDown }: SnakeBoardProps) {
  const { boardBoxRef, cellSize } = useGameBoardScale(GRID_COLS, GRID_ROWS);

  return (
    <div
      ref={boardBoxRef}
      className={styles.box}
      role="application"
      aria-label={boardLabel}
      tabIndex={0}
      style={cellSize > 0 ? ({ '--cell': `${cellSize}px` } as CSSProperties) : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
    >
      {cellSize > 0 && (
        <div
          className={styles.board}
          style={{ width: cellSize * GRID_COLS, height: cellSize * GRID_ROWS }}
        >
          {state.snake.map((seg, i) => {
            const style: CSSProperties = {
              left: seg.x * cellSize,
              top: seg.y * cellSize,
              width: cellSize,
              height: cellSize,
              opacity: i === 0 ? 1 : Math.max(TAIL_FADE_FLOOR, 1 - i * TAIL_FADE_STEP),
            };
            return <div key={i} className={i === 0 ? styles.head : styles.segment} style={style} />;
          })}
          <div
            className={styles.food}
            style={{ left: state.food.x * cellSize, top: state.food.y * cellSize, width: cellSize, height: cellSize }}
          />
        </div>
      )}
    </div>
  );
}
