// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLIMB_FAIL_MS, CLIMB_HOLD_MAX_MS, CLIMB_HOLD_MS, CLIMB_SETTLE_MS, TierGovernor, predictedStepMs, solverIsCause } from './tierPolicy';

describe('solverIsCause', () => {
  it('blames the solver when its cost is unknown', () => {
    expect(solverIsCause(40, 0, 1)).toBe(true);
  });
  it('does not blame a cheap solver for a slow frame', () => {
    expect(solverIsCause(40, 1.6, 3)).toBe(false);
  });
  it('blames a solver whose steps fill the frame', () => {
    expect(solverIsCause(40, 25, 1)).toBe(true);
  });
});

describe('predictedStepMs', () => {
  it('scales the cost with the cell count', () => {
    expect(predictedStepMs(2, 100, 200)).toBe(4);
    expect(predictedStepMs(2, 0, 200)).toBe(0);
  });
});

describe('TierGovernor', () => {
  it('waits out the hold-off after a drop', () => {
    const g = new TierGovernor();
    g.noteDrop(1000);
    expect(g.mayClimb(1000 + CLIMB_HOLD_MS - 1, 1, 8, 16)).toBe(false);
    expect(g.mayClimb(1000 + CLIMB_HOLD_MS, 1, 8, 16)).toBe(true);
  });
  it('climbs only when the predicted step fits the budget', () => {
    const g = new TierGovernor();
    expect(g.mayClimb(0, 3.9, 8, 16)).toBe(true);
    expect(g.mayClimb(0, 4.1, 8, 16)).toBe(false);
  });
  it('without GPU timing, climbs on short settled frames only', () => {
    const g = new TierGovernor();
    expect(g.mayClimb(0, 0, 8, 16.7)).toBe(true);
    expect(g.mayClimb(0, 0, 8, 45)).toBe(false);
    expect(g.mayClimb(0, 0, 8, 0)).toBe(false);
  });
  it('doubles the hold-off when a climb is undone soon after, up to a cap', () => {
    const g = new TierGovernor();
    let now = 0;
    g.noteDrop(now);
    let hold = CLIMB_HOLD_MS;
    for (let i = 0; i < 8; i++) {
      now += hold;
      g.noteClimb(now);
      now += CLIMB_FAIL_MS - 1;
      g.noteDrop(now);
      hold = Math.min(CLIMB_HOLD_MAX_MS, hold * 2);
      expect(g.mayClimb(now + hold - 1, 1, 8, 16)).toBe(false);
      expect(g.mayClimb(now + hold, 1, 8, 16)).toBe(true);
    }
    expect(hold).toBe(CLIMB_HOLD_MAX_MS);
  });
  it('keeps the base hold-off when a climb held for a while', () => {
    const g = new TierGovernor();
    g.noteDrop(0);
    g.noteClimb(CLIMB_HOLD_MS);
    g.noteDrop(CLIMB_HOLD_MS + CLIMB_FAIL_MS);
    expect(g.mayClimb(CLIMB_HOLD_MS + CLIMB_FAIL_MS + CLIMB_HOLD_MS, 1, 8, 16)).toBe(true);
  });
  it('waits between consecutive climbs', () => {
    const g = new TierGovernor();
    g.noteClimb(5000);
    expect(g.mayClimb(5000 + CLIMB_SETTLE_MS - 1, 1, 8, 16)).toBe(false);
    expect(g.mayClimb(5000 + CLIMB_SETTLE_MS, 1, 8, 16)).toBe(true);
  });
  it('returns to the base hold-off after a climb that held', () => {
    const g = new TierGovernor();
    g.noteDrop(0);
    g.noteClimb(CLIMB_HOLD_MS);
    g.noteDrop(CLIMB_HOLD_MS + CLIMB_FAIL_MS - 1);
    g.noteClimb(CLIMB_HOLD_MS * 4);
    g.noteDrop(CLIMB_HOLD_MS * 4 + CLIMB_FAIL_MS);
    expect(g.mayClimb(CLIMB_HOLD_MS * 4 + CLIMB_FAIL_MS + CLIMB_HOLD_MS, 1, 8, 16)).toBe(true);
  });
});
