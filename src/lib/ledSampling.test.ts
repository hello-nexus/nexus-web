import { describe, expect, it } from 'vitest';
import { combinePixels, ledSample, sampleBox, sampleSpot, type SampleDevice } from './ledSampling';

const W = 160;
const H = 96;

function canvas(fill: [number, number, number]) {
  const pixels = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) pixels.set(fill, i * 3);
  return { pixels, w: W, h: H };
}

const setPx = (f: { pixels: Uint8Array }, x: number, y: number, c: [number, number, number]) => f.pixels.set(c, (y * W + x) * 3);

const dev = (over: Partial<SampleDevice> = {}): SampleDevice => ({
  canvasX: 100, canvasY: 100, canvasW: 200, canvasH: 100, canvasRotation: 0, ...over,
});

describe('ledSample positions (mirror of the service linear path)', () => {
  it('walks the rect width along its centerline, first LED at the left', () => {
    const p0 = ledSample(dev(), 0, 3, W, H);
    const p1 = ledSample(dev(), 1, 3, W, H);
    const p2 = ledSample(dev(), 2, 3, W, H);
    // 0.16 pixels per canvas unit: x 100, 200, 300 units; y center 150 units.
    expect([p0.sx, p1.sx, p2.sx]).toEqual([16, 32, 48]);
    expect(p0.sy).toBeCloseTo(24);
  });

  it('puts a lone LED at the box center', () => {
    const p = ledSample(dev(), 0, 1, W, H);
    expect(p.sx).toBeCloseTo(32);
    expect(p.sy).toBeCloseTo(24);
  });

  it('turns the line about the frame center for a rotated device', () => {
    // Frame center (200,150); a 90 degree clockwise turn sends the left end to the top.
    const p0 = ledSample(dev({ canvasRotation: 90 }), 0, 3, W, H);
    const p2 = ledSample(dev({ canvasRotation: 90 }), 2, 3, W, H);
    expect(p0.sx).toBeCloseTo(32);
    expect(p0.sy).toBeCloseTo(8);
    expect(p2.sx).toBeCloseTo(32);
    expect(p2.sy).toBeCloseTo(40);
  });

  it('swaps the cell extents under a quarter turn', () => {
    const flat = ledSample(dev(), 0, 3, W, H);
    const turned = ledSample(dev({ canvasRotation: 90 }), 0, 3, W, H);
    expect(turned.halfW).toBeCloseTo(flat.halfH);
    expect(turned.halfH).toBeCloseTo(flat.halfW);
  });

  it('cuts a stack slot from the unturned rect, keeping the frame center', () => {
    const slot = { layout: 'series' as const, index: 1, count: 2 };
    // Right half of the rect: LEDs run x 200..300 units.
    const p0 = ledSample(dev(), 0, 2, W, H, { slot });
    const p1 = ledSample(dev(), 1, 2, W, H, { slot });
    expect(p0.sx).toBeCloseTo(32);
    expect(p1.sx).toBeCloseTo(48);
  });

  it('spreads full-frame LEDs over the whole canvas, unturned', () => {
    const p0 = ledSample(dev({ canvasRotation: 90 }), 0, 2, W, H, { fullFrame: true });
    const p1 = ledSample(dev({ canvasRotation: 90 }), 1, 2, W, H, { fullFrame: true });
    expect(p0.sx).toBe(0);
    expect(p1.sx).toBe(W);
    expect(p0.sy).toBeCloseTo(H / 2);
  });
});

describe('sampleSpot', () => {
  it('is the plain mean of a 3x3 spot, black included', () => {
    const f = canvas([0, 0, 0]);
    // Three lit pixels of the nine around (10,10).
    for (const x of [9, 10, 11]) setPx(f, x, 9, [90, 90, 90]);
    expect(sampleSpot(f, { sx: 10.4, sy: 10.4, halfW: 50, halfH: 50 })).toEqual([30, 30, 30]);
  });

  it('turns a 1-LED device black when its center is black and the rest of the box is lit', () => {
    const f = canvas([255, 255, 255]);
    const at = ledSample(dev(), 0, 1, W, H);
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) setPx(f, Math.floor(at.sx) + x, Math.floor(at.sy) + y, [0, 0, 0]);
    expect(sampleSpot(f, at)).toEqual([0, 0, 0]);
    // The old whole-cell box mean would have stayed bright.
    expect(sampleBox(f, at)[0]).toBeGreaterThan(200);
  });

  it('shrinks to the LED cell when the cell is smaller than the spot', () => {
    const f = canvas([0, 0, 0]);
    setPx(f, 10, 10, [200, 200, 200]);
    expect(sampleSpot(f, { sx: 10.5, sy: 10.5, halfW: 0.5, halfH: 0.5 })).toEqual([200, 200, 200]);
  });

  it('clamps at the canvas edge', () => {
    const f = canvas([100, 100, 100]);
    expect(sampleSpot(f, { sx: 0, sy: 0, halfW: 50, halfH: 50 })).toEqual([100, 100, 100]);
    expect(sampleSpot(f, { sx: W + 20, sy: H + 20, halfW: 50, halfH: 50 })).toEqual([100, 100, 100]);
  });
});

describe('sampleBox', () => {
  it('is the unweighted mean of the whole cell', () => {
    const f = canvas([0, 0, 0]);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) if (x < 2) setPx(f, 20 + x, 20 + y, [200, 200, 200]);
    expect(sampleBox(f, { sx: 22, sy: 21, halfW: 2, halfH: 1 })).toEqual([100, 100, 100]);
  });
});

// The same fixed canvases and devices as the service's LightingEngineSamplingTests
// (160x90 canvas), asserting the same values, so the two samplers stay
// pixel-identical.
describe('parity with the service sampler', () => {
  const PW = 160;
  const PH = 90;
  const frame = (fill: [number, number, number]) => {
    const pixels = new Uint8Array(PW * PH * 3);
    for (let i = 0; i < PW * PH; i++) pixels.set(fill, i * 3);
    return { pixels, w: PW, h: PH };
  };
  const put = (f: { pixels: Uint8Array }, x: number, y: number, c: [number, number, number]) => f.pixels.set(c, (y * PW + x) * 3);
  const unit = (x: number, y: number, w: number, h: number, rot = 0): SampleDevice => ({ canvasX: x, canvasY: y, canvasW: w, canvasH: h, canvasRotation: rot });
  const read = (f: ReturnType<typeof frame>, d: SampleDevice, i: number, n: number) => sampleSpot(f, ledSample(d, i, n, PW, PH));
  const one = unit(600, 200, 100, 100);

  it('a single LED averages its spot, black included (2 of 3 columns at 150 gives 100)', () => {
    const f = frame([0, 0, 0]);
    for (let y = 36; y <= 38; y++) for (let x = 104; x <= 105; x++) put(f, x, y, [150, 0, 0]);
    expect(read(f, one, 0, 1)[0]).toBe(100);
  });

  it('a single LED goes black when a black band covers its center', () => {
    const f = frame([200, 100, 50]);
    for (let y = 0; y < PH; y++) for (let x = 102; x <= 106; x++) put(f, x, y, [0, 0, 0]);
    expect(read(f, one, 0, 1)).toEqual([0, 0, 0]);
  });

  it('a lit center gives the lit color even with the rest of the box dark', () => {
    const f = frame([0, 0, 0]);
    for (let y = 36; y <= 38; y++) for (let x = 103; x <= 105; x++) put(f, x, y, [255, 128, 0]);
    expect(read(f, one, 0, 1)).toEqual([255, 128, 0]);
  });

  it('clamps at the canvas corners', () => {
    const f = frame([90, 90, 90]);
    expect(read(f, unit(0, 0, 4, 4), 0, 1)).toEqual([90, 90, 90]);
    expect(read(f, unit(996, 596, 4, 4), 0, 1)).toEqual([90, 90, 90]);
  });

  it('a strip turned 45 degrees samples along the diagonal', () => {
    const f = frame([0, 0, 0]);
    for (let y = 54; y <= 56; y++) for (let x = 90; x <= 92; x++) put(f, x, y, [0, 200, 255]);
    const d = unit(400, 290, 200, 20, 45);
    expect(read(f, d, 0, 2)).toEqual([0, 0, 0]);
    expect(read(f, d, 1, 2)).toEqual([0, 200, 255]);
  });

  it('a dense strip reads its own cell, not a neighbour', () => {
    const f = frame([0, 0, 0]);
    for (let y = 0; y < PH; y++) put(f, 80, y, [255, 255, 255]);
    const d = unit(300, 290, 250, 20);
    const lit = Array.from({ length: 60 }, (_, i) => i).filter(i => read(f, d, i, 60)[0] > 0);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThanOrEqual(2);
    for (const i of lit) expect(read(f, d, i, 60)[0]).toBe(255);
  });
});

describe('combinePixels color sampling modes', () => {
  const half = () => {
    const f = canvas([0, 0, 0]);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) setPx(f, x, y, (x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]);
    return f;
  };
  it('standard is the plain mean', () => {
    expect(combinePixels(half(), 0, 0, 1, 1)).toEqual([127, 127, 127]);
    expect(combinePixels(half(), 0, 0, 1, 1, 'standard')).toEqual([127, 127, 127]);
  });
  it('vivid averages in linear light', () => {
    expect(combinePixels(half(), 0, 0, 1, 1, 'vivid')).toEqual([188, 188, 188]);
  });
  it('ignore-black skips near-black pixels', () => {
    expect(combinePixels(half(), 0, 0, 1, 1, 'ignore-black')).toEqual([255, 255, 255]);
    const f = canvas([0, 0, 0]);
    setPx(f, 0, 0, [8, 8, 8]);
    setPx(f, 1, 0, [100, 0, 0]);
    expect(combinePixels(f, 0, 0, 1, 0, 'ignore-black')).toEqual([100, 0, 0]);
  });
  it('ignore-black falls back to the plain mean when all pixels are near-black', () => {
    const f = canvas([0, 0, 0]);
    setPx(f, 0, 0, [8, 8, 8]);
    expect(combinePixels(f, 0, 0, 1, 0, 'ignore-black')).toEqual([4, 4, 4]);
  });
  it('sampleSpot and sampleBox pass the mode through', () => {
    const f = canvas([0, 0, 0]);
    setPx(f, 10, 10, [255, 255, 255]);
    const at = { sx: 10.5, sy: 10.5, halfW: 1, halfH: 1 };
    expect(sampleSpot(f, at, 'ignore-black')).toEqual([255, 255, 255]);
    expect(sampleBox(f, at, 'ignore-black')).toEqual([255, 255, 255]);
    expect(sampleSpot(f, at)).toEqual([28, 28, 28]);
  });
});
