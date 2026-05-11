import { useCallback, useEffect, useRef, useState } from 'react';
import type { WidgetProps } from '../types';
import styles from './BlocksWidget.module.scss';

// Board dimensions
const COLS = 10;
const ROWS = 20;

// Piece definitions - each has rotations pre-computed
const PIECE_DEFS = [
  { // I
    color: '#06b6d4',
    rotations: [
      [[1, 1, 1, 1]],
      [[1], [1], [1], [1]],
    ],
  },
  { // O
    color: '#eab308',
    rotations: [
      [[1, 1], [1, 1]],
    ],
  },
  { // T
    color: '#a855f7',
    rotations: [
      [[0, 1, 0], [1, 1, 1]],
      [[1, 0], [1, 1], [1, 0]],
      [[1, 1, 1], [0, 1, 0]],
      [[0, 1], [1, 1], [0, 1]],
    ],
  },
  { // S
    color: '#22c55e',
    rotations: [
      [[0, 1, 1], [1, 1, 0]],
      [[1, 0], [1, 1], [0, 1]],
    ],
  },
  { // Z
    color: '#ef4444',
    rotations: [
      [[1, 1, 0], [0, 1, 1]],
      [[0, 1], [1, 1], [1, 0]],
    ],
  },
  { // J
    color: '#3b82f6',
    rotations: [
      [[1, 0, 0], [1, 1, 1]],
      [[1, 1], [1, 0], [1, 0]],
      [[1, 1, 1], [0, 0, 1]],
      [[0, 1], [0, 1], [1, 1]],
    ],
  },
  { // L
    color: '#f97316',
    rotations: [
      [[0, 0, 1], [1, 1, 1]],
      [[1, 0], [1, 0], [1, 1]],
      [[1, 1, 1], [1, 0, 0]],
      [[1, 1], [0, 1], [0, 1]],
    ],
  },
];

interface Piece {
  defIdx: number;
  rotation: number;
  x: number;
  y: number;
}

type Board = (string | null)[][];

function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

function getShape(piece: Piece): number[][] {
  const def = PIECE_DEFS[piece.defIdx];
  return def.rotations[piece.rotation % def.rotations.length];
}

function collides(board: Board, piece: Piece, offsetX = 0, offsetY = 0): boolean {
  const shape = getShape(piece);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = piece.x + c + offsetX;
      const ny = piece.y + r + offsetY;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function placePiece(board: Board, piece: Piece): Board {
  const newBoard = board.map(row => [...row]);
  const shape = getShape(piece);
  const color = PIECE_DEFS[piece.defIdx].color;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const ny = piece.y + r;
      const nx = piece.x + c;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        newBoard[ny][nx] = color;
      }
    }
  }
  return newBoard;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter(row => row.some(cell => cell === null));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () =>
    Array.from({ length: COLS }, () => null as string | null)
  );
  return { board: [...empty, ...kept], cleared };
}

function spawnPiece(defIdx: number): Piece {
  const shape = PIECE_DEFS[defIdx].rotations[0];
  const w = shape[0].length;
  return {
    defIdx,
    rotation: 0,
    x: Math.floor((COLS - w) / 2),
    y: -shape.length,
  };
}

function randomPieceIdx(): number {
  return Math.floor(Math.random() * PIECE_DEFS.length);
}

// Ghost piece: project current piece down to where it would land
function ghostY(board: Board, piece: Piece): number {
  let gy = piece.y;
  while (!collides(board, { ...piece, y: gy + 1 })) {
    gy++;
  }
  return gy;
}

const SCORE_TABLE = [0, 100, 300, 500, 800];

type Phase = 'start' | 'playing' | 'gameover';

export function BlocksWidget({ widget }: WidgetProps) {
  const isCompact = widget.size === '1x1';

  const [phase, setPhase] = useState<Phase>('start');
  const [board, setBoard] = useState<Board>(createEmptyBoard);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [lastScore, setLastScore] = useState(0);
  const [renderTick, setRenderTick] = useState(0);

  const currentRef = useRef<Piece | null>(null);
  const nextIdxRef = useRef(randomPieceIdx());
  const boardRef = useRef<Board>(createEmptyBoard());
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
  const gameOverRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const tickSpeed = useCallback(() => {
    return Math.max(50, 500 - (levelRef.current - 1) * 45);
  }, []);

  const syncState = useCallback(() => {
    setBoard(boardRef.current.map(r => [...r]));
    setScore(scoreRef.current);
    setLines(linesRef.current);
    setLevel(levelRef.current);
    setRenderTick(t => t + 1);
  }, []);

  const lock = useCallback(() => {
    if (!currentRef.current) return;

    boardRef.current = placePiece(boardRef.current, currentRef.current);
    const result = clearLines(boardRef.current);

    if (result.cleared > 0) {
      // Flash animation for cleared rows
      const clearedRows: number[] = [];
      const oldBoard = boardRef.current;
      for (let r = 0; r < ROWS; r++) {
        if (oldBoard[r].every(cell => cell !== null)) {
          clearedRows.push(r);
        }
      }
      // Just apply the cleared board immediately
      boardRef.current = result.board;
      scoreRef.current += SCORE_TABLE[result.cleared] * levelRef.current;
      linesRef.current += result.cleared;
      levelRef.current = Math.floor(linesRef.current / 10) + 1;
    }

    // Spawn next piece
    const nextPiece = spawnPiece(nextIdxRef.current);
    nextIdxRef.current = randomPieceIdx();
    currentRef.current = nextPiece;

    // Check if spawn position collides - game over
    if (collides(boardRef.current, nextPiece)) {
      gameOverRef.current = true;
      currentRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setLastScore(scoreRef.current);
      setPhase('gameover');
    }

    syncState();
  }, [syncState]);

  const gameTick = useCallback(() => {
    if (gameOverRef.current || !currentRef.current) return;

    const piece = currentRef.current;
    if (!collides(boardRef.current, piece, 0, 1)) {
      currentRef.current = { ...piece, y: piece.y + 1 };
    } else {
      lock();
    }
    syncState();
  }, [lock, syncState]);

  const startGame = useCallback(() => {
    boardRef.current = createEmptyBoard();
    scoreRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 1;
    gameOverRef.current = false;
    nextIdxRef.current = randomPieceIdx();
    currentRef.current = spawnPiece(randomPieceIdx());
    setPhase('playing');
    syncState();

    if (intervalRef.current) clearInterval(intervalRef.current);

    const runTick = () => {
      gameTick();
      // Restart with current speed (level may have changed)
      if (!gameOverRef.current) {
        intervalRef.current = setTimeout(runTick, tickSpeed()) as unknown as ReturnType<typeof setInterval>;
      }
    };
    intervalRef.current = setTimeout(runTick, tickSpeed()) as unknown as ReturnType<typeof setInterval>;
  }, [gameTick, syncState, tickSpeed]);

  // Keyboard controls
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKey = (e: KeyboardEvent) => {
      if (gameOverRef.current || !currentRef.current) return;
      const piece = currentRef.current;

      if (e.key === 'ArrowLeft') {
        if (!collides(boardRef.current, piece, -1, 0)) {
          currentRef.current = { ...piece, x: piece.x - 1 };
          syncState();
        }
      } else if (e.key === 'ArrowRight') {
        if (!collides(boardRef.current, piece, 1, 0)) {
          currentRef.current = { ...piece, x: piece.x + 1 };
          syncState();
        }
      } else if (e.key === 'ArrowDown') {
        if (!collides(boardRef.current, piece, 0, 1)) {
          currentRef.current = { ...piece, y: piece.y + 1 };
          syncState();
        }
      } else if (e.key === 'ArrowUp') {
        // Rotate
        const def = PIECE_DEFS[piece.defIdx];
        const nextRot = (piece.rotation + 1) % def.rotations.length;
        const rotated = { ...piece, rotation: nextRot };
        if (!collides(boardRef.current, rotated)) {
          currentRef.current = rotated;
          syncState();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, syncState]);

  // Touch controls
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!touchStartRef.current || phase !== 'playing' || !currentRef.current) return;
    const dx = e.clientX - touchStartRef.current.x;
    const dy = e.clientY - touchStartRef.current.y;
    const threshold = 20;
    const piece = currentRef.current;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // Tap - rotate
      const def = PIECE_DEFS[piece.defIdx];
      const nextRot = (piece.rotation + 1) % def.rotations.length;
      const rotated = { ...piece, rotation: nextRot };
      if (!collides(boardRef.current, rotated)) {
        currentRef.current = rotated;
        syncState();
      }
    } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      // Horizontal swipe - move
      const dir = dx > 0 ? 1 : -1;
      if (!collides(boardRef.current, piece, dir, 0)) {
        currentRef.current = { ...piece, x: piece.x + dir };
        syncState();
      }
    } else if (dy > threshold) {
      // Swipe down - soft drop
      let dropY = piece.y;
      while (!collides(boardRef.current, { ...piece, y: dropY + 1 })) {
        dropY++;
      }
      currentRef.current = { ...piece, y: dropY };
      lock();
    }
    touchStartRef.current = null;
  }, [phase, lock, syncState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Suppress unused render tick warning
  void renderTick;

  // Compact 1x1 - just show play button
  if (isCompact && phase === 'start') {
    return (
      <div className={styles.container}>
        <div className={styles.compactPlay} onClick={startGame}>
          <div className={styles.compactIcon}>&#x1F9F1;</div>
          <span className={styles.compactLabel}>Blocks</span>
        </div>
      </div>
    );
  }

  // Start screen
  if (phase === 'start') {
    return (
      <div className={styles.container}>
        <div className={styles.startScreen}>
          <div className={styles.title}>Blocks</div>
          {lastScore > 0 && <div className={styles.lastScore}>Last: {lastScore}</div>}
          <button type="button" className={`panel-chip ${styles.startBtn}`} onClick={startGame}>
            Play
          </button>
        </div>
      </div>
    );
  }

  // Game over
  if (phase === 'gameover') {
    return (
      <div className={styles.container}>
        <div className={styles.startScreen}>
          <div className={styles.title}>Game Over</div>
          <div className={styles.statLine}>Score: {lastScore}</div>
          <div className={styles.statLine}>Lines: {linesRef.current}</div>
          <div className={styles.statLine}>Level: {levelRef.current}</div>
          <button type="button" className={`panel-chip ${styles.startBtn}`} onClick={startGame}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // Playing - render board
  const current = currentRef.current;
  const currentShape = current ? getShape(current) : null;
  const currentColor = current ? PIECE_DEFS[current.defIdx].color : null;
  const ghost = current ? ghostY(boardRef.current, current) : 0;

  // Build next piece preview shape
  const nextShape = PIECE_DEFS[nextIdxRef.current].rotations[0];
  const nextColor = PIECE_DEFS[nextIdxRef.current].color;

  return (
    <div
      className={styles.container}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.sidebar}>
        <div className={styles.sideLabel}>Next</div>
        <div className={styles.nextPreview}>
          {nextShape.map((row, r) => (
            <div key={r} className={styles.previewRow}>
              {row.map((cell, c) => (
                <div
                  key={c}
                  className={styles.previewCell}
                  style={cell ? { background: nextColor } : undefined}
                />
              ))}
            </div>
          ))}
        </div>
        <div className={styles.sideLabel}>Score</div>
        <div className={styles.sideValue}>{score}</div>
        <div className={styles.sideLabel}>Level</div>
        <div className={styles.sideValue}>{level}</div>
        <div className={styles.sideLabel}>Lines</div>
        <div className={styles.sideValue}>{lines}</div>
      </div>
      <div className={styles.boardWrap}>
        <div className={styles.board}>
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) => {
              let color = board[r]?.[c] ?? null;
              let isGhost = false;

              // Check if current piece occupies this cell
              if (!color && current && currentShape && currentColor) {
                const pr = r - current.y;
                const pc = c - current.x;
                if (
                  pr >= 0 && pr < currentShape.length &&
                  pc >= 0 && pc < currentShape[pr].length &&
                  currentShape[pr][pc]
                ) {
                  color = currentColor;
                }
              }

              // Ghost piece
              if (!color && current && currentShape) {
                const gr = r - ghost;
                const gc = c - current.x;
                if (
                  gr >= 0 && gr < currentShape.length &&
                  gc >= 0 && gc < currentShape[gr].length &&
                  currentShape[gr][gc]
                ) {
                  isGhost = true;
                }
              }

              return (
                <div
                  key={`${r}-${c}`}
                  className={`${styles.cell} ${isGhost ? styles.ghost : ''}`}
                  style={color ? { background: color } : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default BlocksWidget;
