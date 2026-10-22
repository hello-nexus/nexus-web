import { describe, expect, it } from 'vitest';
import { truncateUtf8 } from './asusGlacialLcdUtils';

describe('truncateUtf8', () => {
  it('keeps text within the limit', () => {
    expect(truncateUtf8('CPU', 17)).toBe('CPU');
  });

  it('cuts ASCII at the byte limit', () => {
    expect(truncateUtf8('abcdefghijklmnopqrstuvwxyz', 17)).toBe('abcdefghijklmnopq');
  });

  it('cuts multibyte text on a character boundary', () => {
    const cut = truncateUtf8('温度温度温度温度温度温度', 17);
    expect(cut).toBe('温度温度温');
    expect(new TextEncoder().encode(cut).length).toBeLessThanOrEqual(17);
  });

  it('never splits a surrogate pair', () => {
    expect(truncateUtf8('a😀😀😀😀😀', 17)).toBe('a😀😀😀😀');
  });
});
