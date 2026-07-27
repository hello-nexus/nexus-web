import type { Direction } from './snakeLogic';

export interface SnakeInputState {
  // The direction the game loop will try to apply next. Persists across
  // ticks even when a tick rejects it (via changeDirection's 180-degree
  // check) so a still-queued follow-up input recovers it on the next input.
  pendingDirection: Direction;
  queue: Direction[];
}

export function createSnakeInputState(initialDirection: Direction): SnakeInputState {
  return { pendingDirection: initialDirection, queue: [] };
}

/**
 * Queues a direction from user input. Max 2 deep, and a direction equal to
 * the last queued (or pending, if the queue is empty) one is dropped rather
 * than duplicated. The 180-degree reversal check happens later, when a
 * queued direction is applied via snakeLogic.changeDirection - not here.
 */
export function queueDirection(input: SnakeInputState, next: Direction): SnakeInputState {
  const last = input.queue.length > 0 ? input.queue[input.queue.length - 1] : input.pendingDirection;
  if (input.queue.length >= 2 || last === next) return input;
  return { ...input, queue: [...input.queue, next] };
}

/** Dequeues the next pending direction for the upcoming tick, if any is queued. */
export function advanceSnakeInput(input: SnakeInputState): SnakeInputState {
  if (input.queue.length === 0) return input;
  const [pendingDirection, ...queue] = input.queue;
  return { pendingDirection, queue };
}
