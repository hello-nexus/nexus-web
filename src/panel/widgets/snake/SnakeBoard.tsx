import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_COLS, GRID_ROWS, type SnakeState } from './snakeLogic';
import { useGameBoardScale } from '../games-shared/useGameBoardScale';
import styles from './SnakeBoard.module.scss';

// Tail segments fade toward this floor so a long snake stays legible instead
// of blending into a solid block.
const TAIL_FADE_STEP = 0.08;
const TAIL_FADE_FLOOR = 0.5;

// Eat-burst particles: one flight per eat, capped at twice a single burst so
// a rapid double-eat can't accumulate an unbounded particle count.
const PARTICLE_COUNT = 10;
const PARTICLE_CAP = PARTICLE_COUNT * 2;
const PARTICLE_TONES = ['var(--accent)', 'var(--accent-glow)'];

interface Particle {
  readonly id: number;
  readonly style: CSSProperties;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function randomParticleStyle(cellSize: number, tone: string): CSSProperties {
  const angle = Math.random() * Math.PI * 2;
  const distance = cellSize * (1.3 + Math.random() * 0.9);
  const duration = 320 + Math.random() * 180;
  return {
    '--particle-dx': `${Math.cos(angle) * distance}px`,
    '--particle-dy': `${Math.sin(angle) * distance}px`,
    '--particle-tone': tone,
    animationDuration: `${duration}ms`,
  } as CSSProperties;
}

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
  const [particles, setParticles] = useState<readonly Particle[]>([]);
  const particleIdRef = useRef(0);
  const prevScoreRef = useRef(state.score);

  // Fires only on a score-increasing edge (never on mount, never on a
  // restart's score reset to 0), mirroring HeartBurst's rising-edge trigger.
  useEffect(() => {
    const ate = state.score > prevScoreRef.current;
    prevScoreRef.current = state.score;
    if (!ate || cellSize <= 0 || prefersReducedMotion()) return;
    const head = state.snake[0];
    const cx = head.x * cellSize + cellSize / 2;
    const cy = head.y * cellSize + cellSize / 2;
    const burst: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      particleIdRef.current += 1;
      return {
        id: particleIdRef.current,
        style: {
          ...randomParticleStyle(cellSize, PARTICLE_TONES[i % PARTICLE_TONES.length]),
          left: cx,
          top: cy,
        },
      };
    });
    setParticles(prev => [...prev, ...burst].slice(-PARTICLE_CAP));
  }, [state.score, state.snake, cellSize]);

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
          {particles.map((p) => (
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
