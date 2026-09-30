import { describe, it, expect } from 'vitest';
import { deckImageRects } from './resizeDeckImage';

// jsdom can't rasterize canvas, so the rect math is what's tested.
describe('deckImageRects', () => {
  it('scales the crop rect of the oriented image to fill the key', () => {
    const r = deckImageRects({ x: 0.25, y: 0, w: 0.5, h: 1 }, false, 200, 100, 144);
    expect(r).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100, dx: 0, dy: 0, dw: 144, dh: 144 });
  });

  it('narrows a non-square crop to its centred square', () => {
    const r = deckImageRects({ x: 0, y: 0, w: 1, h: 1 }, false, 200, 100, 144);
    expect(r).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100, dx: 0, dy: 0, dw: 144, dh: 144 });
  });

  it('fits a wide image whole, centred vertically', () => {
    const r = deckImageRects({ x: 0, y: 0, w: 1, h: 1 }, true, 200, 100, 144);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 200, sh: 100, dx: 0, dy: 36, dw: 144, dh: 72 });
  });

  it('fits a tall image whole, centred horizontally', () => {
    const r = deckImageRects({ x: 0, y: 0, w: 1, h: 1 }, true, 100, 200, 144);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 100, sh: 200, dx: 36, dy: 0, dw: 72, dh: 144 });
  });

  it('ignores the crop rect when fitting', () => {
    const r = deckImageRects({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, true, 144, 144, 144);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 144, sh: 144, dx: 0, dy: 0, dw: 144, dh: 144 });
  });
});
