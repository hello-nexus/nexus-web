import { describe, it, expect } from 'vitest';
import { NEUTRAL_COLOR_ADJUST, type LightingColorAdjust } from '../../../../api/lighting';
import { RIBBON_SAMPLES, applyColorAdjust, toCss } from './colorTuning';

const adjust = (patch: Partial<LightingColorAdjust>): LightingColorAdjust =>
  ({ ...NEUTRAL_COLOR_ADJUST, ...patch });

/**
 * `applyColorAdjust` is the preview half of a contract whose other half lives
 * in nexus-service (`DeviceColorAdjust.Apply`). These cases pin the behaviour
 * the two must agree on; a drift here means the ribbon promises a colour the
 * hardware never receives.
 */
describe('applyColorAdjust', () => {
  it('passes a colour through untouched at neutral', () => {
    expect(applyColorAdjust([10, 120, 250], NEUTRAL_COLOR_ADJUST)).toEqual([10, 120, 250]);
  });

  it('scales only its own channel', () => {
    expect(applyColorAdjust([200, 200, 200], adjust({ red: 0.5 }))).toEqual([100, 200, 200]);
  });

  it('mirrors the warm shift onto red and blue, and cool is its inverse', () => {
    const [wr, wg, wb] = applyColorAdjust([100, 100, 100], adjust({ temperature: 1 }));
    expect(wr).toBeGreaterThan(100);
    expect(wg).toBe(100);
    expect(wb).toBeLessThan(100);

    const [cr, cg, cb] = applyColorAdjust([100, 100, 100], adjust({ temperature: -1 }));
    expect(cr).toBe(wb);
    expect(cg).toBe(100);
    expect(cb).toBe(wr);
  });

  it('collapses to Rec.709 luma at zero saturation', () => {
    // 0.2126 * 255 = 54.2, truncated to 54 - the same value the service's
    // (byte) cast produces.
    expect(applyColorAdjust([255, 0, 0], adjust({ saturation: 0 }))).toEqual([54, 54, 54]);
  });

  it('truncates rather than rounds, matching the service byte cast', () => {
    // 100 * 1.005 = 100.5: rounding would preview 101.
    expect(applyColorAdjust([100, 100, 100], adjust({ green: 1.005 }))[1]).toBe(100);
  });

  it('clamps an out-of-range trim instead of overflowing the byte', () => {
    expect(applyColorAdjust([250, 250, 250], adjust({ red: 9, temperature: 5 }))[0]).toBe(255);
  });
});

describe('RIBBON_SAMPLES', () => {
  it('walks a full hue sweep and ends on a neutral ramp', () => {
    expect(RIBBON_SAMPLES).toHaveLength(28);
    expect(RIBBON_SAMPLES[0]).toEqual([255, 0, 0]);
    // The neutrals are what make a temperature trim legible, so they must stay
    // grey at source: equal channels, descending.
    const neutrals = RIBBON_SAMPLES.slice(-4);
    for (const [r, g, b] of neutrals) {
      expect(g).toBe(r);
      expect(b).toBe(r);
    }
    expect(neutrals.map(([r]) => r)).toEqual([...neutrals.map(([r]) => r)].sort((a, b) => b - a));
  });

  it('renders as css rgb triples', () => {
    expect(toCss([1, 2, 3])).toBe('rgb(1, 2, 3)');
  });
});
