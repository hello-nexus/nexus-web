import { describe, expect, it } from 'vitest';
import { FLOW_LOOK, PARITY_LOOK } from './flowLook';

describe('flow look', () => {
  it('is complete and uses the ring size the history texture holds', () => {
    for (const [key, value] of Object.entries(FLOW_LOOK)) expect(value, key).toBeDefined();
    expect(FLOW_LOOK.trailSteps).toBeLessThan(90);
  });

  it('keeps the parity look the same except for the particle behavior the CPU reference lacks', () => {
    expect({ ...PARITY_LOOK, fadeOut: FLOW_LOOK.fadeOut, exitShare: FLOW_LOOK.exitShare, outDecay: FLOW_LOOK.outDecay, speedGamma: FLOW_LOOK.speedGamma, speedGammaHi: FLOW_LOOK.speedGammaHi }).toEqual(FLOW_LOOK);
    expect(PARITY_LOOK.fadeOut).toBe(0);
    expect(PARITY_LOOK.speedGamma).toBe(1);
  });
});
