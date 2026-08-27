// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PALETTE, PALETTE_FAMILIES, PALETTE_SHADE_COUNT, PALETTE_SHADE_ROWS, isPaletteKey,
  nearestPaletteId, paletteColor, paletteColorForKey, paletteIdFromKey, paletteKey,
} from './lightingPalette';
import { hsvToHex } from '../lib/settings';

describe('lighting palette', () => {
  it('offers every family at every shade', () => {
    expect(PALETTE_SHADE_ROWS).toHaveLength(PALETTE_SHADE_COUNT);
    expect(PALETTE.length).toBe(PALETTE_FAMILIES.length * PALETTE_SHADE_COUNT);
  });

  // The grid draws these rows in order, so a family owning one column depends
  // on every row listing the families in the same order.
  it('lines the families up column by column', () => {
    for (const [i, row] of PALETTE_SHADE_ROWS.entries()) {
      expect(row.map(c => c.family)).toEqual([...PALETTE_FAMILIES]);
      expect(row.map(c => c.shade)).toEqual(row.map(() => i + 1));
    }
  });

  it('has unique ids and well-formed hexes', () => {
    const ids = new Set(PALETTE.map(c => c.id));
    expect(ids.size).toBe(PALETTE.length);
    for (const c of PALETTE) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('never bottoms out to black - an LED at zero reads as off, not as dark', () => {
    for (const c of PALETTE) expect(c.v).toBeGreaterThanOrEqual(0.3);
  });

  it("carries each swatch's own hsv", () => {
    for (const c of PALETTE) expect(hsvToHex(c.h * 360, c.s * 100, c.v * 100)).toBe(c.hex);
  });

  it('round-trips a pick key', () => {
    const key = paletteKey('red-3');
    expect(isPaletteKey(key)).toBe(true);
    expect(paletteIdFromKey(key)).toBe('red-3');
    expect(paletteColorForKey(key)?.id).toBe('red-3');
  });

  it('does not claim effect keys', () => {
    expect(isPaletteKey('gradientlinear')).toBe(false);
    expect(paletteIdFromKey('gradientlinear')).toBeNull();
    expect(paletteColorForKey('simplered')).toBeUndefined();
  });

  it('maps an exact palette hex back to itself', () => {
    for (const c of PALETTE) expect(nearestPaletteId(c.hex)).toBe(c.id);
  });

  // Migration reads the hex a legacy flat pick stored, so the colour a device
  // was actually wearing decides where it lands.
  it.each([
    ['#ff0000', 'red'],
    ['#00ff00', 'green'],
    ['#0000ff', 'blue'],
    ['#ffffff', 'white'],
  ])('maps %s onto the %s family', (hex, family) => {
    expect(paletteColor(nearestPaletteId(hex))?.family).toBe(family);
  });

  it('falls back to the first swatch for a colour it cannot read', () => {
    expect(nearestPaletteId('')).toBe(PALETTE[0].id);
    expect(nearestPaletteId('nonsense')).toBe(PALETTE[0].id);
  });
});
