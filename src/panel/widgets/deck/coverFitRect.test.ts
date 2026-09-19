import { describe, it, expect } from 'vitest';
import { coverFitRect } from './coverFitRect';

// Used by resizeDeckImage.ts's client-side upload crop; jsdom can't
// rasterize canvas, so this pure rect math is what's tested.
describe('coverFitRect', () => {
  it('crops a wider-than-square image, centering the overflow horizontally', () => {
    const rect = coverFitRect(200, 100, 100);
    expect(rect).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });

  it('crops a taller-than-square image, centering the overflow vertically', () => {
    const rect = coverFitRect(100, 200, 100);
    expect(rect).toEqual({ x: 0, y: -50, w: 100, h: 200 });
  });

  it('exactly fits a square image with no offset', () => {
    const rect = coverFitRect(144, 144, 90);
    expect(rect).toEqual({ x: 0, y: 0, w: 90, h: 90 });
  });

  it('scales up a small image to fully cover a larger key face', () => {
    const rect = coverFitRect(50, 50, 144);
    expect(rect).toEqual({ x: 0, y: 0, w: 144, h: 144 });
  });
});
