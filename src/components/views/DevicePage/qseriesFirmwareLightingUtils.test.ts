import { describe, expect, it } from 'vitest';
import type { CurvePoint } from '../../../api/cooling';
import type { QSeriesFirmwareAnimation } from '../../../api/qseries';
import { animationsEqual, curvesEqual } from './qseriesFirmwareLightingUtils';

// These two decide whether the Save buttons arm, and the component tests cannot
// reach the cases below: jsdom cannot drag the curve SVG, so sub-integer drift
// and length mismatches are only exercisable here.

const PUMP: CurvePoint[] = [
  { temp: 34, speed: 32 }, { temp: 38, speed: 37 }, { temp: 43, speed: 45 },
  { temp: 47, speed: 56 }, { temp: 50, speed: 91 },
];

const ANIMATION: QSeriesFirmwareAnimation = { animation: 1, r: 255, g: 255, b: 255, brightness: 100 };

describe('curvesEqual', () => {
  it('treats an identical curve as equal', () => {
    expect(curvesEqual(PUMP, [...PUMP])).toBe(true);
  });

  it('rounds to whole degrees and percent, so a sub-integer drag does not arm Save', () => {
    // The API and the UI both work in whole units; a drag landing on 34.4/31.6
    // still round-trips as 34/32 and must not read as an edit.
    const drifted = PUMP.map((p, i) => (i === 0 ? { temp: 34.4, speed: 31.6 } : p));
    expect(curvesEqual(PUMP, drifted)).toBe(true);
  });

  it('sees a whole-unit change as different', () => {
    const changed = PUMP.map((p, i) => (i === 0 ? { ...p, speed: p.speed + 1 } : p));
    expect(curvesEqual(PUMP, changed)).toBe(false);
  });

  it('is false when the lengths differ', () => {
    expect(curvesEqual(PUMP, PUMP.slice(0, 4))).toBe(false);
    expect(curvesEqual([], PUMP)).toBe(false);
  });
});

describe('animationsEqual', () => {
  it('compares every field', () => {
    expect(animationsEqual(ANIMATION, { ...ANIMATION })).toBe(true);
    expect(animationsEqual(ANIMATION, { ...ANIMATION, brightness: 99 })).toBe(false);
    expect(animationsEqual(ANIMATION, { ...ANIMATION, animation: 2 })).toBe(false);
    expect(animationsEqual(ANIMATION, { ...ANIMATION, g: 254 })).toBe(false);
  });

  it('treats two unread animations as equal, and one unread as different', () => {
    // A null side is "not read yet"; two nulls must not arm Save, and a null
    // against a value must not read as equal either.
    expect(animationsEqual(null, null)).toBe(true);
    expect(animationsEqual(ANIMATION, null)).toBe(false);
    expect(animationsEqual(null, ANIMATION)).toBe(false);
  });
});
