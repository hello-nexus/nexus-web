import { describe, it, expect } from 'vitest';
import {
  applyLineClear,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clearFullRows,
  computeDropSpeedMs,
  computeFastFallStepMs,
  computeHardDropDistance,
  computeLandingPreview,
  computeLevel,
  comboJuiceTier,
  createEmptyBoard,
  createInitialBlocksState,
  hardDrop,
  hasCollision,
  placeOnBoard,
  randomShapeBlocks,
  rotateShape,
  SHAPES,
  SPAWN_POSITION,
  stepBlocks,
  tryMove,
  tryRotate,
  type BlocksRunState,
} from './blocksLogic';

describe('blocksLogic', () => {
  const fixedRandom = () => 0;

  describe('rotation pivots', () => {
    it('O never rotates', () => {
      const blocks = SHAPES.yellow;
      const rotated = rotateShape(blocks);
      expect(rotated).toBe(blocks);
    });

    it('I pivots on cell 1, becoming a vertical line', () => {
      const rotated = rotateShape(SHAPES.cyan);
      expect(rotated).toEqual([
        { x: 1, y: 0, color: 'cyan' },
        { x: 1, y: 1, color: 'cyan' },
        { x: 1, y: 2, color: 'cyan' },
        { x: 1, y: 3, color: 'cyan' },
      ]);
    });

    it('S pivots on cell 3', () => {
      const rotated = rotateShape(SHAPES.green);
      expect(rotated[3]).toEqual(SHAPES.green[3]);
    });

    it('Z defaults to cell 1', () => {
      const rotated = rotateShape(SHAPES.red);
      expect(rotated[1]).toEqual(SHAPES.red[1]);
    });

    it('T, J, and L pivot on cell 2', () => {
      for (const color of ['purple', 'blue', 'orange'] as const) {
        const rotated = rotateShape(SHAPES[color]);
        expect(rotated[2]).toEqual(SHAPES[color][2]);
      }
    });

    it('applies four rotations back to the starting shape', () => {
      let blocks = SHAPES.purple;
      for (let i = 0; i < 4; i++) blocks = rotateShape(blocks);
      expect(blocks).toEqual(SHAPES.purple);
    });
  });

  describe('tryRotate (no wall kicks)', () => {
    it('discards a rotation that would collide with a boundary', () => {
      const board = createEmptyBoard();
      // The I piece lies flat on the bottom row; rotating it vertical would
      // push it past the floor with no kick to save it.
      const position = { x: 0, y: BOARD_HEIGHT - 2 };
      expect(hasCollision(board, SHAPES.cyan, position)).toBe(false);
      const result = tryRotate(board, SHAPES.cyan, position);
      expect(result).toBe(SHAPES.cyan);
    });

    it('applies a rotation that fits', () => {
      const board = createEmptyBoard();
      const position = { x: 2, y: 2 };
      const result = tryRotate(board, SHAPES.cyan, position);
      expect(result).not.toBe(SHAPES.cyan);
      expect(hasCollision(board, result, position)).toBe(false);
    });
  });

  describe('hasCollision', () => {
    it('detects a left-wall violation', () => {
      const board = createEmptyBoard();
      expect(hasCollision(board, SHAPES.cyan, { x: -1, y: 0 })).toBe(true);
    });

    it('detects a right-wall violation', () => {
      const board = createEmptyBoard();
      expect(hasCollision(board, SHAPES.cyan, { x: BOARD_WIDTH - 3, y: 0 })).toBe(true);
    });

    it('detects a floor violation', () => {
      const board = createEmptyBoard();
      expect(hasCollision(board, SHAPES.yellow, { x: 0, y: BOARD_HEIGHT - 1 })).toBe(true);
    });

    it('detects a placed-cell violation', () => {
      const board = createEmptyBoard();
      board[5][2] = 'red';
      expect(hasCollision(board, SHAPES.yellow, { x: 2, y: 4 })).toBe(true);
    });

    it('allows a legal position', () => {
      const board = createEmptyBoard();
      expect(hasCollision(board, SHAPES.yellow, { x: 2, y: 4 })).toBe(false);
    });
  });

  describe('placeOnBoard + clearFullRows', () => {
    it('stamps a shape onto the board', () => {
      const board = createEmptyBoard();
      const next = placeOnBoard(board, SHAPES.yellow, { x: 0, y: 0 });
      expect(next[0][0]).toBe('yellow');
      expect(next[1][1]).toBe('yellow');
      expect(board[0][0]).toBeNull();
    });

    it('clears one full row and refills the top', () => {
      const board = createEmptyBoard();
      for (let x = 0; x < BOARD_WIDTH; x++) board[BOARD_HEIGHT - 1][x] = 'blue';
      const { board: next, clearedRows } = clearFullRows(board);
      expect(clearedRows).toBe(1);
      expect(next).toHaveLength(BOARD_HEIGHT);
      expect(next[0].every(cell => cell === null)).toBe(true);
      expect(next[BOARD_HEIGHT - 1].every(cell => cell === null)).toBe(true);
    });

    it('clears multiple full rows at once', () => {
      const board = createEmptyBoard();
      for (const y of [BOARD_HEIGHT - 1, BOARD_HEIGHT - 2]) {
        for (let x = 0; x < BOARD_WIDTH; x++) board[y][x] = 'green';
      }
      const { clearedRows } = clearFullRows(board);
      expect(clearedRows).toBe(2);
    });

    it('reports zero when nothing is full', () => {
      const board = createEmptyBoard();
      board[BOARD_HEIGHT - 1][0] = 'orange';
      const { clearedRows, board: next } = clearFullRows(board);
      expect(clearedRows).toBe(0);
      expect(next[BOARD_HEIGHT - 1][0]).toBe('orange');
    });
  });

  describe('computeHardDropDistance', () => {
    it('falls to the floor on an empty board', () => {
      const board = createEmptyBoard();
      const distance = computeHardDropDistance(board, SHAPES.cyan, { x: 0, y: 0 });
      expect(distance).toBe(BOARD_HEIGHT - 2);
    });

    it('stops on top of a stack', () => {
      const board = createEmptyBoard();
      board[10][0] = 'red';
      const distance = computeHardDropDistance(board, SHAPES.yellow, { x: 0, y: 0 });
      // The O piece occupies local rows 0-1; it must rest with its bottom row at y=9.
      expect(distance).toBe(8);
    });

    it('is zero when already resting on a stack', () => {
      const board = createEmptyBoard();
      board[BOARD_HEIGHT - 1][0] = 'red';
      board[BOARD_HEIGHT - 1][1] = 'red';
      // The O piece's bottom row sits directly above the stack; one more
      // step down would collide with row BOARD_HEIGHT - 1.
      const distance = computeHardDropDistance(board, SHAPES.yellow, { x: 0, y: BOARD_HEIGHT - 3 });
      expect(distance).toBe(0);
    });
  });

  describe('computeLandingPreview', () => {
    it('ghost sits at the landing footprint on an empty board', () => {
      const board = createEmptyBoard();
      const position = { x: 0, y: 0 };
      const distance = computeHardDropDistance(board, SHAPES.yellow, position);
      const preview = computeLandingPreview(board, SHAPES.yellow, position);
      expect(preview.ghostCells).toEqual([
        { x: 0, y: 0 + distance, color: 'yellow' },
        { x: 1, y: 0 + distance, color: 'yellow' },
        { x: 0, y: 1 + distance, color: 'yellow' },
        { x: 1, y: 1 + distance, color: 'yellow' },
      ]);
    });

    it('trail fills the columns between the piece and the ghost, excluding both', () => {
      const board = createEmptyBoard();
      const position = { x: 0, y: 0 };
      const distance = computeHardDropDistance(board, SHAPES.yellow, position);
      const preview = computeLandingPreview(board, SHAPES.yellow, position);
      const pieceBottomY = Math.max(...SHAPES.yellow.map(c => c.y)) + position.y;
      const occupiedColumns = new Set(SHAPES.yellow.map(c => c.x + position.x));
      for (const x of occupiedColumns) {
        const cellsInColumn = SHAPES.yellow.filter(c => c.x + position.x === x).length;
        expect(preview.trailCells.filter(c => c.x === x)).toHaveLength(distance - cellsInColumn);
      }
      for (const cell of preview.trailCells) {
        expect(cell.y).toBeGreaterThan(pieceBottomY);
        expect(cell.y).toBeLessThan(pieceBottomY + distance);
      }
    });

    it('never paints a trail cell under the ghost footprint', () => {
      const board = createEmptyBoard();
      const position = { x: 0, y: 0 };
      for (const [name, blocks] of Object.entries(SHAPES)) {
        const preview = computeLandingPreview(board, blocks, position);
        const ghostKeys = new Set(preview.ghostCells.map(c => `${c.x},${c.y}`));
        const overlap = preview.trailCells.filter(c => ghostKeys.has(`${c.x},${c.y}`));
        expect(overlap, `${name} trail overlaps its ghost`).toEqual([]);
      }
    });

    it('stops the ghost on top of a stack, not the floor', () => {
      const board = createEmptyBoard();
      board[10][0] = 'red';
      board[10][1] = 'red';
      const position = { x: 0, y: 0 };
      const preview = computeLandingPreview(board, SHAPES.yellow, position);
      // The O piece's bottom row rests directly above the stack at row 9.
      expect(preview.ghostCells.map(c => c.y)).toEqual([8, 8, 9, 9]);
    });

    it('is empty (no trail) and ghost equals the piece when already resting', () => {
      const board = createEmptyBoard();
      board[BOARD_HEIGHT - 1][0] = 'red';
      board[BOARD_HEIGHT - 1][1] = 'red';
      const position = { x: 0, y: BOARD_HEIGHT - 3 };
      expect(computeHardDropDistance(board, SHAPES.yellow, position)).toBe(0);
      const preview = computeLandingPreview(board, SHAPES.yellow, position);
      expect(preview.trailCells).toEqual([]);
      expect(preview.ghostCells).toEqual([
        { x: 0, y: BOARD_HEIGHT - 3, color: 'yellow' },
        { x: 1, y: BOARD_HEIGHT - 3, color: 'yellow' },
        { x: 0, y: BOARD_HEIGHT - 2, color: 'yellow' },
        { x: 1, y: BOARD_HEIGHT - 2, color: 'yellow' },
      ]);
    });

    it('tracks a rotated shape, one trail column per occupied column', () => {
      const board = createEmptyBoard();
      const rotated = rotateShape(SHAPES.cyan);
      const position = { x: 2, y: 0 };
      const distance = computeHardDropDistance(board, rotated, position);
      const preview = computeLandingPreview(board, rotated, position);
      const occupiedColumns = new Set(rotated.map(c => c.x + position.x));
      expect(occupiedColumns.size).toBe(1);
      const columns = new Set(preview.trailCells.map(c => c.x));
      expect(columns).toEqual(occupiedColumns);
      expect(preview.trailCells).toHaveLength(distance - rotated.length);
      expect(preview.ghostCells.every(c => occupiedColumns.has(c.x))).toBe(true);
    });

    it('offsets a horizontal drag before computing the landing spot', () => {
      const board = createEmptyBoard();
      const position = { x: 3, y: 0 };
      const preview = computeLandingPreview(board, SHAPES.yellow, position);
      expect(preview.ghostCells.every(c => c.x === 3 || c.x === 4)).toBe(true);
    });
  });

  describe('applyLineClear (combo scoring)', () => {
    it('scores nothing and resets combo on a non-clearing placement', () => {
      expect(applyLineClear(0, 3)).toEqual({ scoreDelta: 0, nextCombo: 0 });
    });

    it('scores a single-row clear at multiplier 1 from a cold combo', () => {
      expect(applyLineClear(1, 0)).toEqual({ scoreDelta: 100, nextCombo: 1 });
    });

    it('escalates the multiplier across consecutive clearing placements', () => {
      let combo = 0;
      let result = applyLineClear(1, combo);
      expect(result).toEqual({ scoreDelta: 100, nextCombo: 1 });
      combo = result.nextCombo;

      result = applyLineClear(1, combo);
      expect(result).toEqual({ scoreDelta: 100, nextCombo: 2 });
      combo = result.nextCombo;

      result = applyLineClear(2, combo);
      expect(result).toEqual({ scoreDelta: 400, nextCombo: 4 });
    });

    it('resets the combo after a miss, restarting the multiplier at 1', () => {
      let result = applyLineClear(2, 4);
      expect(result.nextCombo).toBe(6);
      result = applyLineClear(0, result.nextCombo);
      expect(result).toEqual({ scoreDelta: 0, nextCombo: 0 });
      result = applyLineClear(1, result.nextCombo);
      expect(result).toEqual({ scoreDelta: 100, nextCombo: 1 });
    });
  });

  describe('computeDropSpeedMs (monotone lookup)', () => {
    it('starts at the 800ms floor', () => {
      expect(computeDropSpeedMs(0)).toBe(800);
      expect(computeDropSpeedMs(499)).toBe(800);
    });

    it('steps down at each threshold', () => {
      expect(computeDropSpeedMs(500)).toBe(700);
      expect(computeDropSpeedMs(3500)).toBe(300);
    });

    it('never leaves a gap between the old table\'s disjoint ranges', () => {
      // These scores fell between two of the reference table's ranges and
      // would have silently frozen the speed there; the fixed table always
      // resolves to the highest threshold not exceeding the score.
      expect(computeDropSpeedMs(5000)).toBe(270);
      expect(computeDropSpeedMs(7000)).toBe(210);
      expect(computeDropSpeedMs(9500)).toBe(170);
    });

    it('bottoms out at the 150ms floor and stays there', () => {
      expect(computeDropSpeedMs(10000)).toBe(150);
      expect(computeDropSpeedMs(999_999)).toBe(150);
    });

    it('is monotonically non-increasing as score rises', () => {
      let prev = computeDropSpeedMs(0);
      for (let score = 0; score <= 12000; score += 250) {
        const speed = computeDropSpeedMs(score);
        expect(speed).toBeLessThanOrEqual(prev);
        prev = speed;
      }
    });
  });

  describe('computeLevel (mirrors computeDropSpeedMs tier boundaries)', () => {
    it('starts at level 1', () => {
      expect(computeLevel(0)).toBe(1);
      expect(computeLevel(499)).toBe(1);
    });

    it('steps up at each threshold', () => {
      expect(computeLevel(500)).toBe(2);
      expect(computeLevel(3500)).toBe(8);
    });

    it('reaches the final tier at the top score', () => {
      expect(computeLevel(10000)).toBe(14);
      expect(computeLevel(999_999)).toBe(14);
    });

    it('is monotonically non-decreasing as score rises', () => {
      let prev = computeLevel(0);
      for (let score = 0; score <= 12000; score += 250) {
        const level = computeLevel(score);
        expect(level).toBeGreaterThanOrEqual(prev);
        prev = level;
      }
    });
  });

  describe('comboJuiceTier', () => {
    it('has no juice below combo 3', () => {
      expect(comboJuiceTier(0)).toBe(0);
      expect(comboJuiceTier(2)).toBe(0);
    });

    it('escalates through the tiers', () => {
      expect(comboJuiceTier(3)).toBe(1);
      expect(comboJuiceTier(6)).toBe(2);
      expect(comboJuiceTier(10)).toBe(3);
    });
  });

  describe('spawn collision ends the game', () => {
    it('is not a collision on an empty board', () => {
      const board = createEmptyBoard();
      expect(hasCollision(board, randomShapeBlocks(fixedRandom), SPAWN_POSITION)).toBe(false);
    });

    it('is a collision when the spawn area is already stacked', () => {
      const board = createEmptyBoard();
      for (let x = 0; x < BOARD_WIDTH; x++) {
        board[0][x] = 'red';
        board[1][x] = 'red';
      }
      expect(hasCollision(board, randomShapeBlocks(fixedRandom), SPAWN_POSITION)).toBe(true);
    });

    it('stepBlocks ends the run when the freshly locked piece leaves no room to spawn', () => {
      // Row 1 is filled under columns 0-5 (col 6 left open so the row itself
      // never completes and clears). The O piece rests on top of it at the
      // very top of the board, and the next spawn's row lands right back on
      // that same filled row.
      const board = createEmptyBoard();
      for (let x = 0; x < BOARD_WIDTH - 1; x++) board[1][x] = 'blue';
      const state: BlocksRunState = {
        board,
        blocks: SHAPES.yellow,
        position: { x: 0, y: 0 },
        score: 0,
        combo: 0,
        gameOver: false,
      };
      expect(hasCollision(board, state.blocks, state.position, 0, 1)).toBe(true);
      const next = stepBlocks(state, fixedRandom);
      expect(next.gameOver).toBe(true);
    });
  });

  describe('tryMove', () => {
    it('moves when the destination is clear', () => {
      const board = createEmptyBoard();
      const moved = tryMove(board, SHAPES.yellow, { x: 2, y: 0 }, 1);
      expect(moved).toEqual({ x: 3, y: 0 });
    });

    it('holds position when the destination would collide with a wall', () => {
      const board = createEmptyBoard();
      const position = { x: BOARD_WIDTH - 2, y: 0 };
      const moved = tryMove(board, SHAPES.yellow, position, 1);
      expect(moved).toEqual(position);
    });
  });

  describe('stepBlocks (tick orchestration)', () => {
    it('falls one row when the space below is clear', () => {
      const state = createInitialBlocksState(fixedRandom);
      const next = stepBlocks(state, fixedRandom);
      expect(next.position.y).toBe(state.position.y + 1);
      expect(next.blocks).toBe(state.blocks);
      expect(next.gameOver).toBe(false);
    });

    it('locks, clears, scores, and spawns the next piece when blocked', () => {
      const board = createEmptyBoard();
      // Fill the bottom row except the O piece's own two columns, so its
      // landing completes the row.
      for (let x = 2; x < BOARD_WIDTH; x++) {
        board[BOARD_HEIGHT - 1][x] = 'red';
        board[BOARD_HEIGHT - 2][x] = 'red';
      }
      const state: BlocksRunState = {
        board,
        blocks: SHAPES.yellow,
        position: { x: 0, y: BOARD_HEIGHT - 2 },
        score: 0,
        combo: 0,
        gameOver: false,
      };
      const next = stepBlocks(state, fixedRandom);
      expect(next.gameOver).toBe(false);
      // Two rows cleared, cold combo -> 2 * 100 * 1.
      expect(next.score).toBe(200);
      expect(next.combo).toBe(2);
      expect(next.position).toEqual(SPAWN_POSITION);
    });

    it('does nothing once the game is already over', () => {
      const state = createInitialBlocksState(fixedRandom);
      const over = { ...state, gameOver: true };
      expect(stepBlocks(over, fixedRandom)).toBe(over);
    });
  });

  describe('hardDrop', () => {
    it('drops straight to the floor and locks in one call', () => {
      const state = createInitialBlocksState(fixedRandom);
      const next = hardDrop(state, fixedRandom);
      expect(next.position).toEqual(SPAWN_POSITION);
      expect(next.blocks).not.toBe(state.blocks);
    });
  });

  describe('computeFastFallStepMs (hard-drop animation timing)', () => {
    it('is zero for a non-positive distance', () => {
      expect(computeFastFallStepMs(0)).toBe(0);
      expect(computeFastFallStepMs(-1)).toBe(0);
    });

    it('is positive for any positive distance', () => {
      for (let distance = 1; distance <= BOARD_HEIGHT; distance++) {
        expect(computeFastFallStepMs(distance)).toBeGreaterThan(0);
      }
    });

    it('per-row time is non-increasing as distance grows, so a tall drop never animates slower than a short one', () => {
      let prevStep = computeFastFallStepMs(1);
      for (let distance = 2; distance <= BOARD_HEIGHT; distance++) {
        const step = computeFastFallStepMs(distance);
        expect(step).toBeLessThanOrEqual(prevStep);
        prevStep = step;
      }
    });

    it('total travel time (step * distance) is non-decreasing as distance grows', () => {
      let prevTotal = 0;
      for (let distance = 1; distance <= BOARD_HEIGHT; distance++) {
        const total = computeFastFallStepMs(distance) * distance;
        expect(total).toBeGreaterThanOrEqual(prevTotal);
        prevTotal = total;
      }
    });

    it('caps total travel time: a much taller drop takes no longer than a merely tall one', () => {
      const tallTotal = computeFastFallStepMs(BOARD_HEIGHT) * BOARD_HEIGHT;
      const tallerTotal = computeFastFallStepMs(BOARD_HEIGHT * 3) * (BOARD_HEIGHT * 3);
      expect(tallerTotal).toBeCloseTo(tallTotal, 6);
    });

    it('floors total travel time: a one-row drop is not effectively instant', () => {
      // If there were no floor, a single row would take the same per-row
      // time as every other row in the unclamped middle of the range.
      const midRangeStep = computeFastFallStepMs(Math.floor(BOARD_HEIGHT / 2));
      expect(computeFastFallStepMs(1)).toBeGreaterThan(midRangeStep);
    });
  });
});
