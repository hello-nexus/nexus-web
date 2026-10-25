import { describe, expect, it } from 'vitest';
import { studioBlock } from './studioBlocks';

// Runs the wipe block's shipped edge statements (the lines after x is picked) as JS.
function wipeAt(softness: number) {
  const code = studioBlock('wipe')!.code.split('\n').slice(-2).join('\n')
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\$speed/g, '1.0')
    .replace(/\$softness/g, String(softness));
  const glsl = {
    fract: (v: number) => v - Math.floor(v),
    mod: (a: number, b: number) => a - b * Math.floor(a / b),
    floor: Math.floor,
    mix: (a: number, b: number, k: number) => a + (b - a) * k,
    smoothstep: (e0: number, e1: number, v: number) => {
      const k = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
      return k * k * (3 - 2 * k);
    },
  };
  const run = new Function('t', 'x', ...Object.keys(glsl), `let f; ${code}; return f;`);
  // ph = t * speed * 0.25, so one pass is t = 4.
  return (ph: number, x: number) => run(ph * 4, x, ...Object.values(glsl)) as number;
}

const positions = Array.from({ length: 101 }, (_, i) => i / 100);

describe('wipe', () => {
  it.each([0.002, 0.25, 0.5])('fully covers the strip before the sides swap at softness %s', softness => {
    const f = wipeAt(softness);
    for (const x of positions) {
      expect(f(0, x)).toBeCloseTo(0, 3);
      expect(f(0.99999, x)).toBeCloseTo(1, 2);
      expect(Math.abs(f(0.99999, x) - f(1, x))).toBeLessThan(0.01);
    }
  });

  it('keeps a hard edge where it was', () => {
    const f = wipeAt(0.002);
    expect(f(0.5, 0.49)).toBe(1);
    expect(f(0.5, 0.51)).toBe(0);
  });
});
