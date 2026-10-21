import { describe, expect, it } from 'vitest';
import { areaBoxRects, areaBoxSample, sampleAreaBox } from './areaBoxes';

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
  // A frame whose top half is white and bottom half black.
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

// Expected values worked from LedSpotGeometry.MapBox (nexus-service LedSampling.cs): corners laid on the
// frame rect, turned about the frame center, bounding rect taken.
describe('areaBoxSample', () => {
  const dev = { canvasX: 100, canvasY: 100, canvasW: 400, canvasH: 200, canvasRotation: 0 };
  const close = (s: { sx: number; sy: number; halfW: number; halfH: number }, e: number[]) =>
    e.forEach((v, i) => expect([s.sx, s.sy, s.halfW, s.halfH][i]).toBeCloseTo(v, 3));

  it('maps an unturned box onto the frame rect', () => {
    close(areaBoxSample(dev, { index: 0, u0: 0, v0: 0, u1: 0.5, v1: 1 }, 1000, 600), [200, 200, 100, 100]);
  });
  it('turns the box about the frame center for a quarter turn', () => {
    close(areaBoxSample({ ...dev, canvasRotation: 90 }, { index: 0, u0: 0, v0: 0, u1: 0.5, v1: 1 }, 1000, 600), [300, 100, 100, 100]);
  });
  it('cuts a stack slot before turning, about the whole frame center', () => {
    const slot = { layout: 'parallel' as const, index: 1, count: 2 };
    close(areaBoxSample(dev, { index: 0, u0: 0, v0: 0, u1: 1, v1: 1 }, 1000, 600, slot), [300, 250, 200, 50]);
    close(areaBoxSample({ ...dev, canvasRotation: 90 }, { index: 0, u0: 0, v0: 0, u1: 1, v1: 1 }, 1000, 600, slot), [250, 200, 50, 200]);
  });
  it('maps onto the whole unturned canvas for a sweep read', () => {
    const slot = { layout: 'parallel' as const, index: 1, count: 2 };
    close(areaBoxSample({ ...dev, canvasRotation: 90 }, { index: 0, u0: 0, v0: 0, u1: 0.5, v1: 1 }, 1000, 600, slot, true), [250, 300, 250, 300]);
  });
});

describe('sampleAreaBox on a non-uniform frame', () => {
  // Linear device, 15 LEDs, no UV: full-height columns split along the frame width, over rainbow-ish vertical bars 10 px wide.
  const w = 160, h = 96;
  const pixels = new Uint8Array(w * h * 3);
  const palette = [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = palette[Math.floor(x / 10) % palette.length];
    pixels.set(c, (y * w + x) * 3);
  }
  const boxes: number[] = [];
  for (let i = 0; i < 15; i++) boxes.push(Math.max(0, (i - 0.5) / 14), 0, Math.min(1, (i + 0.5) / 14), 1);
  const colors = (dev: { canvasX: number; canvasY: number; canvasW: number; canvasH: number; canvasRotation: number }) =>
    areaBoxRects(boxes).map(b => sampleAreaBox({ pixels, w, h }, dev, b).join(','));

  it('gives adjacent boxes different colors when the frame spans several bars', () => {
    const c = colors({ canvasX: 100, canvasY: 200, canvasW: 800, canvasH: 100, canvasRotation: 0 });
    for (let i = 1; i < c.length; i++) expect(c[i]).not.toBe(c[i - 1]);
  });
  it('gives equal colors only when the frame sits inside one bar', () => {
    const c = colors({ canvasX: 70, canvasY: 200, canvasW: 40, canvasH: 30, canvasRotation: 0 });
    expect(new Set(c).size).toBe(1);
  });
});
