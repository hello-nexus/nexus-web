// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { advanceSnakeInput, createSnakeInputState, queueDirection } from './snakeInput';
import { changeDirection, createInitialState } from './snakeLogic';

describe('snakeInput', () => {
  describe('queueDirection', () => {
    it('queues a direction different from the current pending one', () => {
      const state = createSnakeInputState('RIGHT');
      const next = queueDirection(state, 'UP');
      expect(next.queue).toEqual(['UP']);
    });

    it('queues up to 2 deep', () => {
      let state = createSnakeInputState('RIGHT');
      state = queueDirection(state, 'UP');
      state = queueDirection(state, 'LEFT');
      expect(state.queue).toEqual(['UP', 'LEFT']);
    });

    it('drops a 3rd queued direction', () => {
      let state = createSnakeInputState('RIGHT');
      state = queueDirection(state, 'UP');
      state = queueDirection(state, 'LEFT');
      state = queueDirection(state, 'DOWN');
      expect(state.queue).toEqual(['UP', 'LEFT']);
    });

    it('drops a direction equal to the last queued one', () => {
      let state = createSnakeInputState('RIGHT');
      state = queueDirection(state, 'UP');
      state = queueDirection(state, 'UP');
      expect(state.queue).toEqual(['UP']);
    });

    it('drops a direction equal to the pending one when the queue is empty', () => {
      const state = createSnakeInputState('RIGHT');
      const next = queueDirection(state, 'RIGHT');
      expect(next.queue).toEqual([]);
    });

    it('allows queuing the exact 180-degree reversal (rejection happens at apply time)', () => {
      const state = createSnakeInputState('RIGHT');
      const next = queueDirection(state, 'LEFT');
      expect(next.queue).toEqual(['LEFT']);
    });
  });

  describe('advanceSnakeInput', () => {
    it('dequeues the next direction as pending', () => {
      let state = createSnakeInputState('RIGHT');
      state = queueDirection(state, 'UP');
      state = queueDirection(state, 'LEFT');
      const advanced = advanceSnakeInput(state);
      expect(advanced.pendingDirection).toBe('UP');
      expect(advanced.queue).toEqual(['LEFT']);
    });

    it('leaves the pending direction unchanged when the queue is empty', () => {
      const state = createSnakeInputState('RIGHT');
      const advanced = advanceSnakeInput(state);
      expect(advanced.pendingDirection).toBe('RIGHT');
      expect(advanced.queue).toEqual([]);
    });
  });

  describe('a queued reversal is rejected at apply time, and stays pending until overridden', () => {
    it('keeps moving in the prior direction across ticks until a new input arrives', () => {
      let input = createSnakeInputState('RIGHT');
      input = queueDirection(input, 'LEFT');
      let state = createInitialState(() => 0);

      // Tick 1: dequeue LEFT, changeDirection rejects the 180-degree reversal.
      input = advanceSnakeInput(input);
      expect(input.pendingDirection).toBe('LEFT');
      let applied = changeDirection(state, input.pendingDirection);
      expect(applied.direction).toBe('RIGHT');
      state = applied;

      // Tick 2, no new input: still rejected, snake keeps its prior direction.
      input = advanceSnakeInput(input);
      applied = changeDirection(state, input.pendingDirection);
      expect(applied.direction).toBe('RIGHT');

      // A fresh perpendicular input recovers it.
      input = queueDirection(input, 'UP');
      input = advanceSnakeInput(input);
      applied = changeDirection(state, input.pendingDirection);
      expect(applied.direction).toBe('UP');
    });
  });
});
