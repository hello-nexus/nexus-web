// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extractArtPalette, vividStop } from './artPalette';

function pixels(...runs: [number, [number, number, number, number?]][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [count, [r, g, b, a = 255]] of runs) {
    for (let i = 0; i < count; i++) out.push(r, g, b, a);
  }
  return new Uint8ClampedArray(out);
}

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('extractArtPalette', () => {
  it('returns four distinct colours ordered darkest first', () => {
    const palette = extractArtPalette(pixels(
      [400, [40, 25, 15]],
      [300, [240, 190, 40]],
      [200, [30, 120, 220]],
      [100, [245, 225, 210]],
    ));
    expect(palette).toHaveLength(4);
    const lums = palette.map(luminance);
    expect([...lums].sort((a, b) => a - b)).toEqual(lums);
  });

  it('prefers a small saturated accent over a large grey field', () => {
    const [color] = extractArtPalette(pixels(
      [900, [128, 128, 128]],
      [100, [230, 30, 30]],
    ), 1);
    expect(color[0]).toBeGreaterThan(0.8);
    expect(color[1]).toBeLessThan(0.2);
  });

  it('ignores transparent pixels', () => {
    expect(extractArtPalette(pixels([64, [255, 0, 0, 0]]))).toEqual([]);
  });

  it('fills monochrome art with shades of the one colour found', () => {
    const palette = extractArtPalette(pixels([256, [200, 60, 60]]));
    expect(palette).toHaveLength(4);
    for (const [r, g, b] of palette) {
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeCloseTo(b, 5);
    }
  });
});

describe('vividStop', () => {
  it('keeps the hue but lifts value and saturation', () => {
    const [r, g, b] = vividStop([0.42, 0.28, 0.2]);
    expect(r).toBeCloseTo(1, 5);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeLessThan(0.2);
  });

  it('leaves greys grey and maps black to mid-grey', () => {
    expect(vividStop([0.4, 0.4, 0.4])).toEqual([1, 1, 1]);
    expect(vividStop([0, 0, 0])).toEqual([0.5, 0.5, 0.5]);
  });
});
