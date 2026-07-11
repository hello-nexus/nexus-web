import { describe, it, expect } from 'vitest';
import { applyKeyTransform, applyOrientation, resolveDeckKeyTransform, transformForModel, type RawImage } from './deckKeyTransform';

// 2x2 RGBA image, each pixel a distinct color, to make every permutation
// case unambiguous:
//   TL=red    TR=green
//   BL=blue   BR=white
function makeSquare(): RawImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, // row 0: red, green
      0, 0, 255, 255, 255, 255, 255, 255, // row 1: blue, white
    ]),
  };
}

function pixel(img: RawImage, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4;
  return Array.from(img.data.slice(o, o + 4));
}

describe('transformForModel', () => {
  it('maps the Mini family to mirrorXRot90', () => {
    expect(transformForModel('Mini')).toBe('mirrorXRot90');
    expect(transformForModel('Mini MK.2')).toBe('mirrorXRot90');
    expect(transformForModel('Mini Discord')).toBe('mirrorXRot90');
    expect(transformForModel('Mini MK.2 Module')).toBe('mirrorXRot90');
  });

  it('maps Pedal to none', () => {
    expect(transformForModel('Pedal')).toBe('none');
  });

  it('defaults every other model to flipBoth', () => {
    expect(transformForModel('MK.2')).toBe('flipBoth');
    expect(transformForModel('Original')).toBe('flipBoth');
    expect(transformForModel('XL V2')).toBe('flipBoth');
    expect(transformForModel('Neo')).toBe('flipBoth');
  });

  it('is case and punctuation insensitive', () => {
    expect(transformForModel('mini-mk2')).toBe('mirrorXRot90');
    expect(transformForModel('MINI')).toBe('mirrorXRot90');
  });
});

describe('resolveDeckKeyTransform', () => {
  it('the server-provided transform wins over the model-name derivation', () => {
    expect(resolveDeckKeyTransform('Mini', 'none')).toBe('none');
    expect(resolveDeckKeyTransform('MK.2', 'mirrorXRot90')).toBe('mirrorXRot90');
  });

  it('falls back to the model-name derivation when the field is absent', () => {
    expect(resolveDeckKeyTransform('Mini')).toBe('mirrorXRot90');
    expect(resolveDeckKeyTransform('MK.2')).toBe('flipBoth');
  });
});

describe('applyKeyTransform', () => {
  it('none is a pass-through', () => {
    const img = makeSquare();
    expect(applyKeyTransform(img, 'none')).toBe(img);
  });

  it('flipBoth reverses the pixel order (180 degree rotation)', () => {
    const out = applyKeyTransform(makeSquare(), 'flipBoth');
    expect(pixel(out, 0, 0)).toEqual([255, 255, 255, 255]); // was BR (white)
    expect(pixel(out, 1, 0)).toEqual([0, 0, 255, 255]); // was BL (blue)
    expect(pixel(out, 0, 1)).toEqual([0, 255, 0, 255]); // was TR (green)
    expect(pixel(out, 1, 1)).toEqual([255, 0, 0, 255]); // was TL (red)
  });

  it('mirrorXRot90 mirrors horizontally then rotates 90 counterclockwise', () => {
    const out = applyKeyTransform(makeSquare(), 'mirrorXRot90');
    // mirror X: TL<->TR, BL<->BR -> [green, red / white, blue]
    // rotate 90 CCW of that 2x2: (x,y) -> (y, w-1-x); net effect is a
    // transpose of the original (mirrorX then CCW cancel to a diagonal flip).
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(pixel(out, 0, 0)).toEqual([255, 0, 0, 255]); // red
    expect(pixel(out, 1, 0)).toEqual([0, 0, 255, 255]); // blue
    expect(pixel(out, 0, 1)).toEqual([0, 255, 0, 255]); // green
    expect(pixel(out, 1, 1)).toEqual([255, 255, 255, 255]); // white
  });

  it('rotate90 swaps width/height for a non-square image', () => {
    const wide: RawImage = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      ]),
    };
    const out = applyKeyTransform(wide, 'mirrorXRot90');
    expect(out.width).toBe(1);
    expect(out.height).toBe(3);
  });
});

describe('applyOrientation', () => {
  it('0 is a pass-through', () => {
    const img = makeSquare();
    expect(applyOrientation(img, 0)).toBe(img);
  });

  it('180 reverses the pixel order', () => {
    const out = applyOrientation(makeSquare(), 180);
    expect(pixel(out, 0, 0)).toEqual([255, 255, 255, 255]); // was BR (white)
    expect(pixel(out, 1, 1)).toEqual([255, 0, 0, 255]); // was TL (red)
  });

  it('90 (mount rotated 90 clockwise) counter-rotates the content counterclockwise', () => {
    const out = applyOrientation(makeSquare(), 90);
    expect(pixel(out, 0, 0)).toEqual([0, 255, 0, 255]); // green (was TR)
    expect(pixel(out, 1, 0)).toEqual([255, 255, 255, 255]); // white (was BR)
    expect(pixel(out, 0, 1)).toEqual([255, 0, 0, 255]); // red (was TL)
    expect(pixel(out, 1, 1)).toEqual([0, 0, 255, 255]); // blue (was BL)
  });

  it('270 (mount rotated 90 counterclockwise) counter-rotates the content clockwise', () => {
    const out = applyOrientation(makeSquare(), 270);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 255, 255]); // blue (was BL)
    expect(pixel(out, 1, 0)).toEqual([255, 0, 0, 255]); // red (was TL)
    expect(pixel(out, 0, 1)).toEqual([255, 255, 255, 255]); // white (was BR)
    expect(pixel(out, 1, 1)).toEqual([0, 255, 0, 255]); // green (was TR)
  });

  it('rotate90 swaps width/height for a non-square image', () => {
    const wide: RawImage = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      ]),
    };
    const out = applyOrientation(wide, 90);
    expect(out.width).toBe(1);
    expect(out.height).toBe(3);
  });
});

describe('composed user orientation + model wire transform', () => {
  it('rotates the content by orientation before the model transform runs', () => {
    const rotated = applyOrientation(makeSquare(), 270);
    const composed = applyKeyTransform(rotated, 'flipBoth');
    expect(pixel(composed, 0, 0)).toEqual([0, 255, 0, 255]); // green
    expect(pixel(composed, 1, 0)).toEqual([255, 255, 255, 255]); // white
    expect(pixel(composed, 0, 1)).toEqual([255, 0, 0, 255]); // red
    expect(pixel(composed, 1, 1)).toEqual([0, 0, 255, 255]); // blue
  });
});
