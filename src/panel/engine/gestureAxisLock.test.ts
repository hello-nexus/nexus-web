// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { claimGestureAxis, resetGestureAxis } from './gestureAxisLock';

describe('gestureAxisLock', () => {
  afterEach(() => resetGestureAxis());

  it('locks the gesture to the first axis that claims it', () => {
    expect(claimGestureAxis('vertical')).toBe(true);
    expect(claimGestureAxis('horizontal')).toBe(false); // other axis is locked out
    expect(claimGestureAxis('vertical')).toBe(true); // idempotent for the owner
  });

  it('releases on reset so the next gesture can claim either axis', () => {
    claimGestureAxis('horizontal');
    resetGestureAxis();
    expect(claimGestureAxis('vertical')).toBe(true);
  });
});
