// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  tick,
  changeDirection,
  getNextHead,
  checkCollision,
  isOpposite,
  spawnFood,
  GRID_COLS,
  GRID_ROWS,
} from './snakeLogic';

describe('snakeLogic', () => {
  // Deterministic random: always returns 0
  const fixedRandom = () => 0;

  describe('createInitialState', () => {
    it('creates a snake of length 3 moving right', () => {
      const state = createInitialState(fixedRandom);
      expect(state.snake).toHaveLength(3);
      expect(state.direction).toBe('RIGHT');
      expect(state.score).toBe(0);
      expect(state.gameOver).toBe(false);
    });

    it('places snake in the center of the grid', () => {
      const state = createInitialState(fixedRandom);
      const head = state.snake[0];
      expect(head.x).toBe(Math.floor(GRID_COLS / 2));
      expect(head.y).toBe(Math.floor(GRID_ROWS / 2));
    });

    it('spawns food not on the snake', () => {
      const state = createInitialState(fixedRandom);
      const snakeSet = new Set(state.snake.map((p) => `${p.x},${p.y}`));
      expect(snakeSet.has(`${state.food.x},${state.food.y}`)).toBe(false);
    });
  });

  describe('getNextHead', () => {
    it('moves up', () => {
      expect(getNextHead({ x: 5, y: 5 }, 'UP')).toEqual({ x: 5, y: 4 });
    });
    it('moves down', () => {
      expect(getNextHead({ x: 5, y: 5 }, 'DOWN')).toEqual({ x: 5, y: 6 });
    });
    it('moves left', () => {
      expect(getNextHead({ x: 5, y: 5 }, 'LEFT')).toEqual({ x: 4, y: 5 });
    });
    it('moves right', () => {
      expect(getNextHead({ x: 5, y: 5 }, 'RIGHT')).toEqual({ x: 6, y: 5 });
    });
  });

  describe('isOpposite', () => {
    it('UP and DOWN are opposite', () => {
      expect(isOpposite('UP', 'DOWN')).toBe(true);
    });
    it('LEFT and RIGHT are opposite', () => {
      expect(isOpposite('LEFT', 'RIGHT')).toBe(true);
    });
    it('UP and LEFT are not opposite', () => {
      expect(isOpposite('UP', 'LEFT')).toBe(false);
    });
    it('same direction is not opposite', () => {
      expect(isOpposite('UP', 'UP')).toBe(false);
    });
  });

  describe('getNextHead (wrapping)', () => {
    it('wraps left edge to right', () => {
      expect(getNextHead({ x: 0, y: 5 }, 'LEFT')).toEqual({ x: GRID_COLS - 1, y: 5 });
    });
    it('wraps right edge to left', () => {
      expect(getNextHead({ x: GRID_COLS - 1, y: 5 }, 'RIGHT')).toEqual({ x: 0, y: 5 });
    });
    it('wraps top edge to bottom', () => {
      expect(getNextHead({ x: 5, y: 0 }, 'UP')).toEqual({ x: 5, y: GRID_ROWS - 1 });
    });
    it('wraps bottom edge to top', () => {
      expect(getNextHead({ x: 5, y: GRID_ROWS - 1 }, 'DOWN')).toEqual({ x: 5, y: 0 });
    });
  });

  describe('checkCollision', () => {
    it('detects self-collision', () => {
      const body = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ];
      expect(checkCollision({ x: 5, y: 5 }, body)).toBe(true);
    });
    it('returns false for valid position', () => {
      expect(checkCollision({ x: 5, y: 5 }, [{ x: 3, y: 3 }])).toBe(false);
    });
  });

  describe('spawnFood', () => {
    it('spawns food not on the snake', () => {
      const snake = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ];
      const food = spawnFood(snake, fixedRandom);
      const snakeSet = new Set(snake.map((p) => `${p.x},${p.y}`));
      expect(snakeSet.has(`${food.x},${food.y}`)).toBe(false);
    });

    it('returns a valid grid position', () => {
      const food = spawnFood([], fixedRandom);
      expect(food.x).toBeGreaterThanOrEqual(0);
      expect(food.x).toBeLessThan(GRID_COLS);
      expect(food.y).toBeGreaterThanOrEqual(0);
      expect(food.y).toBeLessThan(GRID_ROWS);
    });
  });

  describe('tick', () => {
    it('moves snake forward in current direction', () => {
      const state = createInitialState(fixedRandom);
      const next = tick(state, fixedRandom);
      expect(next.snake[0].x).toBe(state.snake[0].x + 1);
      expect(next.snake[0].y).toBe(state.snake[0].y);
    });

    it('snake length stays 3 when no food eaten', () => {
      const state = createInitialState(fixedRandom);
      const next = tick(state, fixedRandom);
      expect(next.snake).toHaveLength(3);
    });

    it('grows snake when eating food', () => {
      const state = createInitialState(fixedRandom);
      // Place food directly ahead of snake head
      const head = state.snake[0];
      const stateWithFood = {
        ...state,
        food: { x: head.x + 1, y: head.y },
      };
      const next = tick(stateWithFood, fixedRandom);
      expect(next.snake).toHaveLength(4);
      expect(next.score).toBe(1);
    });

    it('wraps around when hitting right edge', () => {
      const state = createInitialState(fixedRandom);
      const edgeState = {
        ...state,
        snake: [
          { x: GRID_COLS - 1, y: 5 },
          { x: GRID_COLS - 2, y: 5 },
          { x: GRID_COLS - 3, y: 5 },
        ],
        direction: 'RIGHT' as const,
      };
      const next = tick(edgeState, fixedRandom);
      expect(next.gameOver).toBe(false);
      expect(next.snake[0]).toEqual({ x: 0, y: 5 });
    });

    it('does not tick when already game over', () => {
      const state = createInitialState(fixedRandom);
      const overState = { ...state, gameOver: true };
      const next = tick(overState, fixedRandom);
      expect(next).toBe(overState);
    });
  });

  describe('changeDirection', () => {
    it('changes to a non-opposite direction', () => {
      const state = createInitialState(fixedRandom);
      const changed = changeDirection(state, 'UP');
      expect(changed.direction).toBe('UP');
    });

    it('ignores opposite direction', () => {
      const state = createInitialState(fixedRandom);
      // Initial direction is RIGHT, LEFT is opposite
      const changed = changeDirection(state, 'LEFT');
      expect(changed.direction).toBe('RIGHT');
    });

    it('allows perpendicular direction change', () => {
      const state = createInitialState(fixedRandom);
      const changed = changeDirection(state, 'DOWN');
      expect(changed.direction).toBe('DOWN');
    });
  });
});
