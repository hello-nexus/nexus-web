// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  centerCropForAspect,
  flipHorizontal,
  flipVertical,
  normalizeRotate,
  type Orientation,
  rotateCcw,
  rotateCw,
  serializeCrop,
} from './mediaCrop';

const CROP = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };

describe('serializeCrop', () => {
  it('emits the legacy 4-field form for an identity orientation', () => {
    expect(serializeCrop(CROP)).toBe('0.100000,0.200000,0.500000,0.400000');
    expect(serializeCrop({ ...CROP, rotate: 0, mirror: false })).toBe('0.100000,0.200000,0.500000,0.400000');
  });

  it('appends rotate + mirror when either is set', () => {
    expect(serializeCrop({ ...CROP, rotate: 90 })).toBe('0.100000,0.200000,0.500000,0.400000,90,0');
    expect(serializeCrop({ ...CROP, mirror: true })).toBe('0.100000,0.200000,0.500000,0.400000,0,1');
    expect(serializeCrop({ ...CROP, rotate: 270, mirror: true })).toBe('0.100000,0.200000,0.500000,0.400000,270,1');
  });
});

describe('normalizeRotate', () => {
  it('snaps to a legal quarter turn', () => {
    expect(normalizeRotate(undefined)).toBe(0);
    expect(normalizeRotate(90)).toBe(90);
    expect(normalizeRotate(-90)).toBe(270);
    expect(normalizeRotate(450)).toBe(90);
    expect(normalizeRotate(46)).toBe(90);
  });
});

// Independent oracle: the dihedral group acting on a square's corners
// [TL, TR, BR, BL], each holding the SOURCE corner that lands there on screen.
// The button perms match the ffmpeg semantics verified on macOS (transpose=1 =
// 90 CW; hflip = mirror L/R; vflip = mirror T/B).
type Corners = [number, number, number, number];
const ID: Corners = [0, 1, 2, 3];
const pRotateCw = (c: Corners): Corners => [c[3], c[0], c[1], c[2]];
const pRotateCcw = (c: Corners): Corners => [c[1], c[2], c[3], c[0]];
const pFlipH = (c: Corners): Corners => [c[1], c[0], c[3], c[2]];
const pFlipV = (c: Corners): Corners => [c[3], c[2], c[1], c[0]];

function stateToCorners(o: Orientation): Corners {
  let c: Corners = o.mirror ? pFlipH(ID) : ([...ID] as Corners);
  for (let k = normalizeRotate(o.rotate) / 90; k > 0; k--) c = pRotateCw(c);
  return c;
}

const STATES: Orientation[] = [0, 90, 180, 270].flatMap(rotate =>
  [false, true].map(mirror => ({ rotate, mirror })),
);

describe('orientation transitions match corner-permutation semantics', () => {
  it.each(STATES)('rotateCw on %o', o => {
    expect(stateToCorners(rotateCw(o))).toEqual(pRotateCw(stateToCorners(o)));
  });
  it.each(STATES)('rotateCcw on %o', o => {
    expect(stateToCorners(rotateCcw(o))).toEqual(pRotateCcw(stateToCorners(o)));
  });
  it.each(STATES)('flipHorizontal on %o', o => {
    expect(stateToCorners(flipHorizontal(o))).toEqual(pFlipH(stateToCorners(o)));
  });
  it.each(STATES)('flipVertical on %o', o => {
    expect(stateToCorners(flipVertical(o))).toEqual(pFlipV(stateToCorners(o)));
  });
});

describe('orientation group identities', () => {
  const start: Orientation = { rotate: 0, mirror: false };
  it('four CW turns return to start', () => {
    expect(rotateCw(rotateCw(rotateCw(rotateCw(start))))).toEqual(start);
  });
  it('CW then CCW is identity', () => {
    expect(rotateCcw(rotateCw(start))).toEqual(start);
  });
  it('a flip is its own inverse from any state', () => {
    for (const o of STATES) {
      expect(flipHorizontal(flipHorizontal(o))).toEqual(o);
      expect(flipVertical(flipVertical(o))).toEqual(o);
    }
  });
});

// The Klipy pickers commit this crop with no cropper step, so its centring is
// what the imported GIF ends up framed by.
describe('centerCropForAspect', () => {
  it('trims the sides of a source wider than the target', () => {
    const crop = centerCropForAspect(16 / 9, 400, 200);

    expect(crop.w).toBeCloseTo(0.888889, 6);
    expect(crop.h).toBe(1);
    expect(crop.x).toBeCloseTo((1 - crop.w) / 2, 6);
    expect(crop.y).toBe(0);
  });

  it('trims the top and bottom of a source taller than the target', () => {
    const crop = centerCropForAspect(16 / 9, 220, 229);

    expect(crop.w).toBe(1);
    expect(crop.h).toBeCloseTo(0.540393, 6);
    expect(crop.y).toBeCloseTo((1 - crop.h) / 2, 6);
  });

  it('keeps the whole frame when the source already matches', () => {
    expect(centerCropForAspect(16 / 9, 1600, 900)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('keeps the whole frame for a portrait panel aspect on a portrait source', () => {
    expect(centerCropForAspect(720 / 1280, 720, 1280)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
