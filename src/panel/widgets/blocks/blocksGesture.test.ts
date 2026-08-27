// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { beginGesture, updateGesture } from './blocksGesture';

const CELL = 20;

describe('blocksGesture', () => {
  it('moves sideways once the drag crosses a cell', () => {
    const g = beginGesture(100, 100);
    expect(updateGesture(g, 115, 100, CELL).move).toBe(0);
    const result = updateGesture(g, 125, 100, CELL);
    expect(result.move).toBe(1);
    expect(result.drop).toBe(false);
    expect(result.gesture.horizontal).toBe(true);
  });

  it('does not drop on a sideways swipe that drifts down', () => {
    let g = beginGesture(100, 100);
    ({ gesture: g } = updateGesture(g, 125, 110, CELL));
    expect(g.horizontal).toBe(true);
    // Well past the drop distance, but the gesture is already a horizontal one.
    const result = updateGesture(g, 150, 260, CELL);
    expect(result.drop).toBe(false);
  });

  it('keeps the horizontal latch once set, even if the pointer returns to its start column', () => {
    let g = beginGesture(100, 100);
    ({ gesture: g } = updateGesture(g, 125, 100, CELL));
    ({ gesture: g } = updateGesture(g, 100, 100, CELL));
    expect(updateGesture(g, 100, 260, CELL).drop).toBe(false);
  });

  it('does not drop while the downward pull is short', () => {
    const g = beginGesture(100, 100);
    expect(updateGesture(g, 100, 140, CELL).drop).toBe(false);
    expect(updateGesture(g, 100, 149, CELL).drop).toBe(false);
  });

  it('drops on a long downward pull', () => {
    const g = beginGesture(100, 100);
    expect(updateGesture(g, 105, 160, CELL).drop).toBe(true);
  });

  it('marks any travel past the tap slop as a drag, so it cannot fall through to rotate', () => {
    const g = beginGesture(100, 100);
    // An under-shot downward pull: too short to drop, too long to be a tap.
    expect(updateGesture(g, 100, 130, CELL).gesture.dragged).toBe(true);
    expect(updateGesture(g, 118, 100, CELL).gesture.dragged).toBe(true);
    expect(updateGesture(g, 100, 70, CELL).gesture.dragged).toBe(true);
  });

  it('leaves a near-stationary press a tap', () => {
    const g = beginGesture(100, 100);
    const result = updateGesture(g, 104, 103, CELL);
    expect(result.gesture.dragged).toBe(false);
    expect(result.move).toBe(0);
    expect(result.drop).toBe(false);
  });

  it('reports nothing before the board is measured', () => {
    const g = beginGesture(100, 100);
    expect(updateGesture(g, 400, 400, 0)).toEqual({ gesture: g, move: 0, drop: false });
  });
});
