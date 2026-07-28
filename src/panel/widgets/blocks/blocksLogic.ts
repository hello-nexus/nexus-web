export type BlockColor = 'cyan' | 'yellow' | 'purple' | 'green' | 'red' | 'blue' | 'orange';

export interface Point {
  x: number;
  y: number;
}

export interface BlockCell extends Point {
  color: BlockColor;
}

export type Board = (BlockColor | null)[][];

export const BOARD_WIDTH = 7;
export const BOARD_HEIGHT = 25;
export const SPAWN_POSITION: Point = { x: 2, y: 0 };

// Tetromino cell layouts, in their natural (unrotated) orientation. Order and
// colors kept from the ported reference; blocks[1] (the pivot lookup key
// below) is always this shape's identifying color.
export const SHAPES: Record<BlockColor, BlockCell[]> = {
  cyan: [
    { x: 0, y: 1, color: 'cyan' },
    { x: 1, y: 1, color: 'cyan' },
    { x: 2, y: 1, color: 'cyan' },
    { x: 3, y: 1, color: 'cyan' },
  ],
  yellow: [
    { x: 0, y: 0, color: 'yellow' },
    { x: 1, y: 0, color: 'yellow' },
    { x: 0, y: 1, color: 'yellow' },
    { x: 1, y: 1, color: 'yellow' },
  ],
  purple: [
    { x: 1, y: 0, color: 'purple' },
    { x: 0, y: 1, color: 'purple' },
    { x: 1, y: 1, color: 'purple' },
    { x: 2, y: 1, color: 'purple' },
  ],
  green: [
    { x: 1, y: 0, color: 'green' },
    { x: 2, y: 0, color: 'green' },
    { x: 0, y: 1, color: 'green' },
    { x: 1, y: 1, color: 'green' },
  ],
  red: [
    { x: 0, y: 0, color: 'red' },
    { x: 1, y: 0, color: 'red' },
    { x: 1, y: 1, color: 'red' },
    { x: 2, y: 1, color: 'red' },
  ],
  blue: [
    { x: 0, y: 0, color: 'blue' },
    { x: 0, y: 1, color: 'blue' },
    { x: 1, y: 1, color: 'blue' },
    { x: 2, y: 1, color: 'blue' },
  ],
  orange: [
    { x: 2, y: 0, color: 'orange' },
    { x: 0, y: 1, color: 'orange' },
    { x: 1, y: 1, color: 'orange' },
    { x: 2, y: 1, color: 'orange' },
  ],
};

const SHAPE_COLORS = Object.keys(SHAPES) as BlockColor[];

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array<BlockColor | null>(BOARD_WIDTH).fill(null));
}

/** A fresh copy of a random tetromino's natural-orientation cells. */
export function randomShapeBlocks(randomFn: () => number = Math.random): BlockCell[] {
  const color = SHAPE_COLORS[Math.floor(randomFn() * SHAPE_COLORS.length)];
  return SHAPES[color].map(cell => ({ ...cell }));
}

/** True if `blocks` at `position` (offset by dx/dy) would overlap the board bounds or a placed cell. */
export function hasCollision(board: Board, blocks: BlockCell[], position: Point, dx = 0, dy = 0): boolean {
  for (const block of blocks) {
    const x = block.x + position.x + dx;
    const y = block.y + position.y + dy;
    if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT || y < 0 || board[y][x] !== null) {
      return true;
    }
  }
  return false;
}

/** Stamps `blocks` at `position` onto a cloned board; cells that fall outside bounds are dropped. */
export function placeOnBoard(board: Board, blocks: BlockCell[], position: Point): Board {
  const next = board.map(row => row.slice());
  for (const block of blocks) {
    const x = block.x + position.x;
    const y = block.y + position.y;
    if (x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT) {
      next[y][x] = block.color;
    }
  }
  return next;
}

export interface ClearResult {
  board: Board;
  clearedRows: number;
}

/** Removes every full row and refills the top with empty rows. */
export function clearFullRows(board: Board): ClearResult {
  const remaining = board.filter(row => row.some(cell => cell === null));
  const clearedRows = board.length - remaining.length;
  const refill: Board = Array.from({ length: clearedRows }, () => Array<BlockColor | null>(BOARD_WIDTH).fill(null));
  return { board: [...refill, ...remaining], clearedRows };
}

// Pivot cell per shape (index into the 4-cell array). O has none - it never
// rotates. Kept from the reference's rotate(): I/Z default to cell 1, S pivots
// on cell 3, T/J/L pivot on cell 2.
function pivotFor(blocks: BlockCell[]): BlockCell | null {
  const color = blocks[1].color;
  if (color === 'yellow') return null;
  if (color === 'green') return blocks[3];
  if (color === 'purple' || color === 'blue' || color === 'orange') return blocks[2];
  return blocks[1];
}

/** Rotates `blocks` 90 degrees clockwise around its pivot. No-op for O. */
export function rotateShape(blocks: BlockCell[]): BlockCell[] {
  const pivot = pivotFor(blocks);
  if (!pivot) return blocks;
  return blocks.map(block => {
    const x = block.x - pivot.x;
    const y = block.y - pivot.y;
    return { ...block, x: pivot.x - y, y: pivot.y + x };
  });
}

/** Rotates with no wall kicks: a rotation that would collide is discarded outright. */
export function tryRotate(board: Board, blocks: BlockCell[], position: Point): BlockCell[] {
  const rotated = rotateShape(blocks);
  return hasCollision(board, rotated, position) ? blocks : rotated;
}

/** Rows the piece can fall from `position` before it would collide, without mutating any state. */
export function computeHardDropDistance(board: Board, blocks: BlockCell[], position: Point): number {
  let dy = 0;
  while (!hasCollision(board, blocks, position, 0, dy + 1)) {
    dy++;
  }
  return dy;
}

export interface ComboResult {
  scoreDelta: number;
  nextCombo: number;
}

/**
 * Score delta for a placement that cleared `clearedRows`. The multiplier is
 * the combo BEFORE this placement (floored at 1), matching the reference;
 * the combo itself then accumulates by `clearedRows`. A non-clearing
 * placement resets the combo to 0 and scores nothing.
 */
export function applyLineClear(clearedRows: number, priorCombo: number): ComboResult {
  if (clearedRows <= 0) return { scoreDelta: 0, nextCombo: 0 };
  const comboMultiplier = priorCombo > 0 ? priorCombo : 1;
  return { scoreDelta: clearedRows * 100 * comboMultiplier, nextCombo: priorCombo + clearedRows };
}

// Monotone score -> tick-interval lookup, sorted ascending. Every score maps
// to exactly one tier with no gap (the reference table had score ranges that
// matched nothing, silently freezing the speed until a later range caught
// up); the floor tier extends to any score at or above its threshold.
const SPEED_TIERS: ReadonlyArray<{ minScore: number; tickMs: number }> = [
  { minScore: 0, tickMs: 800 },
  { minScore: 500, tickMs: 700 },
  { minScore: 900, tickMs: 650 },
  { minScore: 1400, tickMs: 550 },
  { minScore: 1800, tickMs: 480 },
  { minScore: 2300, tickMs: 400 },
  { minScore: 2900, tickMs: 350 },
  { minScore: 3500, tickMs: 300 },
  { minScore: 4500, tickMs: 270 },
  { minScore: 5500, tickMs: 240 },
  { minScore: 6500, tickMs: 210 },
  { minScore: 7500, tickMs: 190 },
  { minScore: 8500, tickMs: 170 },
  { minScore: 10000, tickMs: 150 },
];

export function computeDropSpeedMs(score: number): number {
  let tickMs = SPEED_TIERS[0].tickMs;
  for (const tier of SPEED_TIERS) {
    if (score < tier.minScore) break;
    tickMs = tier.tickMs;
  }
  return tickMs;
}

/** 1-based index into SPEED_TIERS for the current score - a cheap "level" readout for the HUD. */
export function computeLevel(score: number): number {
  let level = 1;
  for (let i = 0; i < SPEED_TIERS.length; i++) {
    if (score < SPEED_TIERS[i].minScore) break;
    level = i + 1;
  }
  return level;
}

// Combo "juice" intensity tier driving the board's border pulse + shake.
export type ComboJuiceTier = 0 | 1 | 2 | 3;

export function comboJuiceTier(combo: number): ComboJuiceTier {
  if (combo >= 10) return 3;
  if (combo >= 6) return 2;
  if (combo >= 3) return 1;
  return 0;
}

/** Horizontal drag: moves `dx` columns, or holds position if that would collide. */
export function tryMove(board: Board, blocks: BlockCell[], position: Point, dx: number): Point {
  if (dx === 0 || hasCollision(board, blocks, position, dx, 0)) return position;
  return { x: position.x + dx, y: position.y };
}

export interface BlocksRunState {
  board: Board;
  blocks: BlockCell[];
  position: Point;
  score: number;
  combo: number;
  gameOver: boolean;
}

export function createInitialBlocksState(randomFn: () => number = Math.random): BlocksRunState {
  return {
    board: createEmptyBoard(),
    blocks: randomShapeBlocks(randomFn),
    position: { ...SPAWN_POSITION },
    score: 0,
    combo: 0,
    gameOver: false,
  };
}

/**
 * One gravity tick: falls a row when clear, or locks the piece, clears full
 * rows, scores the placement, and spawns the next piece - ending the game if
 * that spawn itself collides.
 */
export function stepBlocks(state: BlocksRunState, randomFn: () => number = Math.random): BlocksRunState {
  if (state.gameOver) return state;

  if (!hasCollision(state.board, state.blocks, state.position, 0, 1)) {
    return { ...state, position: { x: state.position.x, y: state.position.y + 1 } };
  }

  const placed = placeOnBoard(state.board, state.blocks, state.position);
  const { board, clearedRows } = clearFullRows(placed);
  const { scoreDelta, nextCombo } = applyLineClear(clearedRows, state.combo);
  const score = state.score + scoreDelta;
  const nextBlocks = randomShapeBlocks(randomFn);

  if (hasCollision(board, nextBlocks, SPAWN_POSITION)) {
    return { ...state, board, score, combo: nextCombo, gameOver: true };
  }

  return { board, blocks: nextBlocks, position: { ...SPAWN_POSITION }, score, combo: nextCombo, gameOver: false };
}

/** Drops the falling piece straight to its computed landing spot and locks it in the same step. */
export function hardDrop(state: BlocksRunState, randomFn: () => number = Math.random): BlocksRunState {
  if (state.gameOver) return state;
  const distance = computeHardDropDistance(state.board, state.blocks, state.position);
  const dropped = { ...state, position: { x: state.position.x, y: state.position.y + distance } };
  return stepBlocks(dropped, randomFn);
}
