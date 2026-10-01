import { describe, expect, it } from 'vitest';
import { customTextVars, normalizeTextColorMode, pickInk, regionLuminance, relativeLuminance } from './textColor';

function solidGrid(width: number, height: number, [r, g, b]: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width, height };
}

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });
});

describe('pickInk', () => {
  it('puts white text on dark backdrops and black on light ones', () => {
    expect(pickInk(relativeLuminance(20, 10, 40), null)).toBe('light');
    expect(pickInk(relativeLuminance(240, 190, 180), null)).toBe('dark');
  });

  it('holds the current ink inside the hysteresis band', () => {
    expect(pickInk(0.2, 'light')).toBe('light');
    expect(pickInk(0.2, 'dark')).toBe('dark');
    expect(pickInk(0.16, 'dark')).toBe('dark');
    expect(pickInk(0.25, 'light')).toBe('dark');
    expect(pickInk(0.1, 'dark')).toBe('light');
  });
});

describe('regionLuminance', () => {
  it('averages only the cells inside the region', () => {
    const grid = solidGrid(4, 2, [0, 0, 0]);
    grid.data.set([255, 255, 255, 255], 0);
    expect(regionLuminance(grid, 0, 0, 1, 1, [0, 0, 0, 0])).toBeCloseTo(1, 5);
    expect(regionLuminance(grid, 0, 0, 2, 1, [0, 0, 0, 0])).toBeCloseTo(0.5, 5);
  });

  it('composites the card fill over the backdrop', () => {
    const grid = solidGrid(2, 2, [255, 255, 255]);
    expect(regionLuminance(grid, 0, 0, 2, 2, [0, 0, 0, 1])).toBe(0);
    expect(regionLuminance(grid, 0, 0, 2, 2, [0, 0, 0, 0])).toBeCloseTo(1, 5);
  });

  it('is null when the region misses the grid', () => {
    expect(regionLuminance(solidGrid(2, 2, [0, 0, 0]), 3, 0, 5, 2, [0, 0, 0, 0])).toBeNull();
  });
});

describe('normalizeTextColorMode', () => {
  it('defaults to adaptive', () => {
    expect(normalizeTextColorMode(undefined)).toBe('adaptive');
    expect(normalizeTextColorMode('bogus')).toBe('adaptive');
    expect(normalizeTextColorMode('custom')).toBe('custom');
  });
});

describe('customTextVars', () => {
  it('derives every ink tier from the colour', () => {
    const vars = customTextVars('#F80') as Record<string, string>;
    expect(vars['--text']).toBe('#ff8800');
    expect(vars['--text-dim']).toBe('rgba(255, 136, 0, 0.6)');
    expect(vars['--panel-ink-accent']).toBe('#ff8800');
  });

  it('falls back to white for an unparseable colour', () => {
    expect((customTextVars('') as Record<string, string>)['--text']).toBe('#ffffff');
  });
});
