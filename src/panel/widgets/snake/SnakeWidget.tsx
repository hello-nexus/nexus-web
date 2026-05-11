import { useCallback, useEffect, useRef, useState } from 'react';
import type { WidgetProps } from '../types';
import styles from './SnakeWidget.module.scss';

type Direction = 'up' | 'down' | 'left' | 'right';
type Phase = 'select' | 'playing' | 'gameover';

interface Coord {
  x: number;
  y: number;
}

const DIFFICULTY = {
  easy: 190,
  medium: 140,
  hard: 90,
} as const;

function oppositeDir(d: Direction): Direction {
  if (d === 'up') return 'down';
  if (d === 'down') return 'up';
  if (d === 'left') return 'right';
  return 'left';
}

function randomFood(cols: number, rows: number, snake: Coord[]): Coord {
  let pos: Coord;
  do {
    pos = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

export function SnakeWidget({ widget }: WidgetProps) {
  const isCompact = widget.size === '1x1';

  // Grid dimensions based on widget size
  const cols = isCompact ? 8 : 16;
  const rows = isCompact ? 8 : 16;

  const [phase, setPhase] = useState<Phase>('select');
  const [score, setScore] = useState(0);
  const [tick, setTick] = useState(0);

  // Mutable game state in refs to avoid re-render per tick
  const snakeRef = useRef<Coord[]>([]);
  const foodRef = useRef<Coord>({ x: 0, y: 0 });
  const dirRef = useRef<Direction>('right');
  const queuedDirRef = useRef<Direction | null>(null);
  const gameOverRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const startGame = useCallback((speed: number) => {
    const startX = Math.floor(cols / 2);
    const startY = Math.floor(rows / 2);
    const initialSnake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    snakeRef.current = initialSnake;
    foodRef.current = randomFood(cols, rows, initialSnake);
    dirRef.current = 'right';
    queuedDirRef.current = null;
    gameOverRef.current = false;
    setScore(0);
    setPhase('playing');

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (gameOverRef.current) return;

      // Apply queued direction
      if (queuedDirRef.current) {
        dirRef.current = queuedDirRef.current;
        queuedDirRef.current = null;
      }

      const snake = snakeRef.current;
      const head = snake[0];
      const dir = dirRef.current;

      let nx = head.x;
      let ny = head.y;
      if (dir === 'up') ny -= 1;
      else if (dir === 'down') ny += 1;
      else if (dir === 'left') nx -= 1;
      else nx += 1;

      // Wall wrapping
      if (nx < 0) nx = cols - 1;
      if (nx >= cols) nx = 0;
      if (ny < 0) ny = rows - 1;
      if (ny >= rows) ny = 0;

      // Self-collision check (exclude tail since it will move)
      const body = snake.slice(0, -1);
      if (body.some(s => s.x === nx && s.y === ny)) {
        gameOverRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setPhase('gameover');
        return;
      }

      const newHead = { x: nx, y: ny };
      const ate = foodRef.current.x === nx && foodRef.current.y === ny;

      if (ate) {
        snakeRef.current = [newHead, ...snake];
        foodRef.current = randomFood(cols, rows, snakeRef.current);
        setScore(prev => prev + 10);
      } else {
        snakeRef.current = [newHead, ...snake.slice(0, -1)];
      }

      // Trigger re-render for display
      setTick(t => t + 1);
    }, speed);
  }, [cols, rows]);

  // Keyboard controls
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKey = (e: KeyboardEvent) => {
      let newDir: Direction | null = null;
      if (e.key === 'ArrowUp') newDir = 'up';
      else if (e.key === 'ArrowDown') newDir = 'down';
      else if (e.key === 'ArrowLeft') newDir = 'left';
      else if (e.key === 'ArrowRight') newDir = 'right';

      if (newDir && newDir !== oppositeDir(dirRef.current) && newDir !== dirRef.current) {
        queuedDirRef.current = newDir;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase]);

  // Touch swipe controls
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!touchStartRef.current || phase !== 'playing') return;
    const dx = e.clientX - touchStartRef.current.x;
    const dy = e.clientY - touchStartRef.current.y;
    const threshold = 20;

    let newDir: Direction | null = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      newDir = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > threshold) {
      newDir = dy > 0 ? 'down' : 'up';
    }

    if (newDir && newDir !== oppositeDir(dirRef.current) && newDir !== dirRef.current) {
      queuedDirRef.current = newDir;
    }
    touchStartRef.current = null;
  }, [phase]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Build cell lookup set for fast rendering
  const snake = snakeRef.current;
  const food = foodRef.current;

  // Compact 1x1: show play button to expand
  if (isCompact && phase === 'select') {
    return (
      <div className={styles.container}>
        <div className={styles.compactPlay}>
          <div className={styles.compactIcon}>&#x1F40D;</div>
          <span className={styles.compactLabel}>Snake</span>
        </div>
      </div>
    );
  }

  // Difficulty selection
  if (phase === 'select') {
    return (
      <div className={styles.container}>
        <div className={styles.selectScreen}>
          <div className={styles.title}>Snake</div>
          <div className={styles.difficultyBtns}>
            <button type="button" className={`panel-chip ${styles.diffBtn}`} onClick={() => startGame(DIFFICULTY.easy)}>
              Easy
            </button>
            <button type="button" className={`panel-chip ${styles.diffBtn}`} onClick={() => startGame(DIFFICULTY.medium)}>
              Medium
            </button>
            <button type="button" className={`panel-chip ${styles.diffBtn}`} onClick={() => startGame(DIFFICULTY.hard)}>
              Hard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game over
  if (phase === 'gameover') {
    return (
      <div className={styles.container}>
        <div className={styles.selectScreen}>
          <div className={styles.title}>Game Over</div>
          <div className={styles.finalScore}>Score: {score}</div>
          <button type="button" className={`panel-chip ${styles.playAgainBtn}`} onClick={() => setPhase('select')}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // Playing phase - render the grid
  // Suppress unused var warning; tick drives re-renders
  void tick;

  return (
    <div
      className={styles.container}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.scoreOverlay}>
        {score}
      </div>
      <div
        className={styles.board}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: rows }, (_, y) =>
          Array.from({ length: cols }, (_, x) => {
            const snakeIdx = snake.findIndex(s => s.x === x && s.y === y);
            const isFood = food.x === x && food.y === y;
            const isHead = snakeIdx === 0;
            const isBody = snakeIdx > 0;

            let cellClass = styles.cell;
            if (isHead) cellClass += ` ${styles.head}`;
            else if (isBody) cellClass += ` ${styles.body}`;
            else if (isFood) cellClass += ` ${styles.food}`;

            // Body opacity fades toward the tail
            const bodyOpacity = isBody
              ? 1 - (snakeIdx / snake.length) * 0.6
              : undefined;

            return (
              <div
                key={`${x}-${y}`}
                className={cellClass}
                style={isBody ? { opacity: bodyOpacity } : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default SnakeWidget;
