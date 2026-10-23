import { describe, it, expect } from 'vitest';
import { catalogRowSizeForGlass } from './catalogTileAspect';

describe('catalogRowSizeForGlass', () => {
  it('keeps square glass on square rows', () => {
    expect(catalogRowSizeForGlass('lcd-square', 1, 100, 4)).toBeCloseTo(100, 5);
  });

  it('makes a tall portrait glass tile taller than it is wide', () => {
    const aspect = 720 / 1280;
    const row = catalogRowSizeForGlass('lcd-square', aspect, 100, 4)!;
    const tileWidth = 2 * 100 + 4;
    const tileHeight = 2 * row + 4;
    expect(tileWidth / tileHeight).toBeCloseTo(aspect, 5);
    expect(row).toBeGreaterThan(100);
  });

  it('follows the glass aspect on a wide single-widget surface', () => {
    const aspect = 1600 / 720;
    const row = catalogRowSizeForGlass('lcd-wide', aspect, 100, 4)!;
    const tileWidth = 4 * 100 + 3 * 4;
    expect(tileWidth / (2 * row + 4)).toBeCloseTo(aspect, 5);
  });

  it('leaves grid surfaces and unknown aspects alone', () => {
    expect(catalogRowSizeForGlass('monitor', 0.5625, 100, 4)).toBeUndefined();
    expect(catalogRowSizeForGlass('lcd-square', undefined, 100, 4)).toBeUndefined();
    expect(catalogRowSizeForGlass('lcd-square', 0, 100, 4)).toBeUndefined();
  });
});
