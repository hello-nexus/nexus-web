import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { appendCappedBurst, prefersReducedMotion, randomBurstStyle, BURST_TONES, type BurstParticle } from '../games-shared/particleBurst';
import { type Board, type BlockCell, type ComboJuiceTier, type LandingPreview } from './blocksLogic';
import styles from './BlocksBoard.module.scss';

// Row-clear burst: a handful of particles spread across each cleared row,
// capped overall so a multi-row clear can't spray unbounded particles.
const PARTICLES_PER_ROW = 4;
const PARTICLE_CAP = 16;

export interface BlocksBoardProps {
  board: Board;
  // Falling piece cells, already offset to absolute board coordinates.
  fallingBlocks: BlockCell[];
  // Ghost footprint + trajectory trail beneath the falling piece. Null
  // suppresses both (mid hard-drop animation, or no piece to preview).
  landingPreview: LandingPreview | null;
  comboTier: ComboJuiceTier;
  boardLabel: string;
  // Measured by the caller (BlocksTouch also needs cellSize for its drag
  // gesture thresholds, so the scale hook is owned one level up).
  cellSize: number;
  boardBoxRef: (el: HTMLDivElement | null) => void;
  boardWidthCells: number;
  boardHeightCells: number;
  // Score and the rows cleared by the most recent lock - together they
  // trigger the row-clear burst on a rising-score edge (mirrors Snake's
  // eat-burst trigger), reading which rows to place it at.
  score: number;
  clearedRowIndices: number[];
  // A single Pointer Events entry point (not parallel touch + mouse
  // handlers) - see BlocksTouch.handlePointerDown for why.
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function BlocksBoard({
  board, fallingBlocks, landingPreview, comboTier, boardLabel, cellSize, boardBoxRef, boardWidthCells, boardHeightCells,
  score, clearedRowIndices, onPointerDown, onKeyDown,
}: BlocksBoardProps) {
  const [particles, setParticles] = useState<readonly BurstParticle[]>([]);
  const particleIdRef = useRef(0);
  const prevScoreRef = useRef(score);

  // Fires only on a score-rising edge (score only ever increases via a
  // clearing lock), mirroring SnakeBoard's eat-burst trigger.
  useEffect(() => {
    const cleared = score > prevScoreRef.current;
    prevScoreRef.current = score;
    if (!cleared || cellSize <= 0 || clearedRowIndices.length === 0 || prefersReducedMotion()) return;

    const burst: BurstParticle[] = [];
    for (const rowY of clearedRowIndices) {
      const cy = rowY * cellSize + cellSize / 2;
      for (let i = 0; i < PARTICLES_PER_ROW; i++) {
        const cx = (i + 0.5) * (boardWidthCells / PARTICLES_PER_ROW) * cellSize;
        particleIdRef.current += 1;
        burst.push({
          id: particleIdRef.current,
          style: { ...randomBurstStyle(cellSize, BURST_TONES[i % BURST_TONES.length]), left: cx, top: cy },
        });
      }
    }
    setParticles(prev => appendCappedBurst(prev, burst, PARTICLE_CAP));
  }, [score, clearedRowIndices, cellSize, boardWidthCells]);

  return (
    <div
      ref={boardBoxRef}
      className={styles.box}
      role="application"
      aria-label={boardLabel}
      tabIndex={0}
      data-combo-tier={comboTier > 0 ? comboTier : undefined}
      style={cellSize > 0 ? ({ '--cell': `${cellSize}px` } as CSSProperties) : undefined}
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
          {landingPreview?.trailCells.map((cell, i) => {
            const style: CSSProperties = { left: cell.x * cellSize, top: cell.y * cellSize, width: cellSize, height: cellSize };
            return <div key={`trail-${i}`} className={styles.trailCell} style={style} />;
          })}
          {landingPreview?.ghostCells.map((block, i) => {
            const style: CSSProperties = { left: block.x * cellSize, top: block.y * cellSize, width: cellSize, height: cellSize };
            return <div key={`ghost-${i}`} className={styles.cell} data-color={block.color} data-ghost="true" style={style} />;
          })}
          {fallingBlocks.map((block, i) => {
            const style: CSSProperties = { left: block.x * cellSize, top: block.y * cellSize, width: cellSize, height: cellSize };
            return <div key={i} className={styles.cell} data-color={block.color} style={style} />;
          })}
          {particles.map(p => (
            <div
              key={p.id}
              className={styles.particle}
              style={p.style}
              onAnimationEnd={() => setParticles(prev => prev.filter(x => x.id !== p.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
