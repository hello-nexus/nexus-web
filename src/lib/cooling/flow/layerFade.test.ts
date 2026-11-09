import { describe, expect, it } from 'vitest';
import { fadeGoalAfterToggle } from './layerFade';

describe('fadeGoalAfterToggle', () => {
  it('follows the particles switch when nothing is waiting', () => {
    expect(fadeGoalAfterToggle(true, false, 0)).toBe(1);
    expect(fadeGoalAfterToggle(false, false, 1)).toBe(0);
  });

  it('keeps fading out while a rebuild or teardown waits, whatever the switch says', () => {
    expect(fadeGoalAfterToggle(true, true, 0)).toBe(0);
    expect(fadeGoalAfterToggle(false, true, 0)).toBe(0);
  });
});
