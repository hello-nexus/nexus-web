import { describe, expect, it } from 'vitest';
import { areaBoxRects, sampleAreaBox } from './areaBoxes';

describe('areaBoxRects', () => {
  it('unpacks boxes and skips disabled entries, keeping card-local indices', () => {
    expect(areaBoxRects([0, 0, 0.5, 0.5, 0, 0, 0, 0, 0.5, 0.5, 1, 1])).toEqual([
      { index: 0, u0: 0, v0: 0, u1: 0.5, v1: 0.5 },
      { index: 2, u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
    ]);
  });
  it('ignores a trailing partial entry', () => {
    expect(areaBoxRects([0, 0, 1, 1, 0.1])).toHaveLength(1);
  });
});

describe('sampleAreaBox', () => {
  // 100 x 60 canvas, 2 pixels per unit-row block; top half white, bottom half black.
  const w = 100, h = 60;
  const pixels = new Uint8Array(w * h * 3);
  for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) pixels.fill(255, (y * w + x) * 3, (y * w + x) * 3 + 3);
  const dev = { canvasX: 0, canvasY: 0, canvasW: 1000, canvasH: 600, canvasRotation: 0 };
  it('reads white above the bar, black below, and linear-light gray across it', () => {
    const f = { pixels, w, h };
    expect(sampleAreaBox(f, dev, { index: 0, u0: 0, v0: 0, u1: 1, v1: 0.4 })).toEqual([255, 255, 255]);
    expect(sampleAreaBox(f, dev, { index: 1, u0: 0, v0: 0.6, u1: 1, v1: 1 })).toEqual([0, 0, 0]);
    const [r] = sampleAreaBox(f, dev, { index: 2, u0: 0, v0: 0.25, u1: 1, v1: 0.75 });
    expect(r).toBe(188);
  });
});
