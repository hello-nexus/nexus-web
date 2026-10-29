import { describe, expect, it } from 'vitest';
import {
  ANIMATE_SWATCHES, DEFAULT_ANIMATION_KEYS, STATIC_SWATCHES, pickAnimationTiles, pickStaticTiles,
  swatchGrid,
} from './swatches';

describe('swatches', () => {
  it('resolves every default color id, all distinct', () => {
    expect(STATIC_SWATCHES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(STATIC_SWATCHES.map(c => c.hex.toLowerCase())).size).toBe(STATIC_SWATCHES.length);
  });

  it('leads with the default animation order, then the catalog', () => {
    expect(ANIMATE_SWATCHES.slice(0, DEFAULT_ANIMATION_KEYS.length).map(e => e.key)).toEqual(DEFAULT_ANIMATION_KEYS);
    expect(new Set(ANIMATE_SWATCHES.map(e => e.key)).size).toBe(ANIMATE_SWATCHES.length);
    expect(ANIMATE_SWATCHES.every(e => !!e.labelKey)).toBe(true);
  });

  it('leads with the primaries so small widgets show them', () => {
    expect(STATIC_SWATCHES.slice(0, 5).map(c => c.id)).toEqual(['white-1', 'red-3', 'blue-3', 'green-3', 'yellow-3']);
  });

  it('has a fixed grid per size and neither list runs out at 4x4', () => {
    expect(swatchGrid('2x2')).toEqual({ cols: 2, rows: 2, slots: 3 });
    expect(swatchGrid('4x2')).toEqual({ cols: 3, rows: 2, slots: 5 });
    expect(swatchGrid('4x4')).toEqual({ cols: 3, rows: 5, slots: 14 });
    expect(swatchGrid('4x4', false).slots).toBe(15);
    expect(STATIC_SWATCHES.length).toBeGreaterThanOrEqual(14);
    expect(ANIMATE_SWATCHES.length).toBeGreaterThanOrEqual(14);
  });

  it('puts recent colors first, deduped against the palette, and ignores bad entries', () => {
    const first = STATIC_SWATCHES[0].hex;
    const tiles = pickStaticTiles(['#123456', first.toUpperCase(), 'nope'], true, 5);
    expect(tiles).toHaveLength(5);
    expect(tiles[0].hex).toBe('#123456');
    expect(tiles[1].hex.toLowerCase()).toBe(first.toLowerCase());
    expect(new Set(tiles.map(t => t.hex.toLowerCase())).size).toBe(5);
  });

  it('ignores recent colors when off', () => {
    expect(pickStaticTiles(['#123456'], false, 3).map(t => t.hex)).toEqual(STATIC_SWATCHES.slice(0, 3).map(c => c.hex));
  });

  it('puts recent animations first, skipping unknown keys and repeats', () => {
    const keys = pickAnimationTiles(['aurora', 'gone', 'aurora', 'sweeprainbow'], true, 4).map(e => e.key);
    expect(keys).toEqual(['aurora', 'rainbow', 'plasma', 'fire']);
    expect(pickAnimationTiles(['aurora'], false, 2).map(e => e.key)).toEqual(['rainbow', 'plasma']);
  });
});
