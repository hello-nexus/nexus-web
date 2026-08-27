// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { encodeBmp } from './encodeBmp';
import type { RawImage } from './deckKeyTransform';

describe('encodeBmp', () => {
  it('encodes a 4x1 image with no row padding needed (stride already a multiple of 4)', () => {
    const img: RawImage = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        10, 20, 30, 255,
        40, 50, 60, 255,
        70, 80, 90, 255,
        100, 110, 120, 255,
      ]),
    };
    const bytes = Array.from(encodeBmp(img));
    const expected = [
      // file header: 'B','M', fileSize=66, reserved=0, pixelDataOffset=54
      0x42, 0x4d, 66, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0,
      // DIB header: size=40, width=4, height=1, planes=1, bpp=24,
      // compression=0, imageSize=12, xppm=0, yppm=0, colorsUsed=0, importantColors=0
      40, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 1, 0, 24, 0,
      0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      // pixel data, BGR, single row, no padding (4 * 3 = 12 bytes exactly)
      30, 20, 10, 60, 50, 40, 90, 80, 70, 120, 110, 100,
    ];
    expect(bytes).toEqual(expected);
  });

  it('encodes a 1x2 image bottom-up with a row padding byte', () => {
    const colorA = [200, 10, 10, 255]; // top row
    const colorB = [10, 10, 200, 255]; // bottom row
    const img: RawImage = {
      width: 1,
      height: 2,
      data: new Uint8ClampedArray([...colorA, ...colorB]),
    };
    const bytes = Array.from(encodeBmp(img));
    const expected = [
      // file header: fileSize = 14 + 40 + (4 * 2) = 62, pixelDataOffset=54
      0x42, 0x4d, 62, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0,
      // DIB header: width=1, height=2, imageSize=8 (stride 4 * 2 rows)
      40, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 24, 0,
      0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      // pixel data, bottom-up: colorB's row first, then colorA's row, each
      // padded to a 4-byte stride (3 BGR bytes + 1 padding byte).
      200, 10, 10, 0,
      10, 10, 200, 0,
    ];
    expect(bytes).toEqual(expected);
  });

  it('total byte length matches width/height/stride math', () => {
    const img: RawImage = {
      width: 3,
      height: 3,
      data: new Uint8ClampedArray(3 * 3 * 4),
    };
    const bytes = encodeBmp(img);
    const stride = Math.ceil((3 * 3) / 4) * 4; // 10 -> 12
    expect(bytes.length).toBe(14 + 40 + stride * 3);
  });
});
