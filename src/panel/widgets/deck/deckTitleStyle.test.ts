import { describe, it, expect } from 'vitest';
import { resolveDeckTitleStyle, titleFontSizeCss, DECK_TITLE_SIZE_MIN, DECK_TITLE_SIZE_MAX, DECK_TITLE_SIZE_DEFAULT } from './deckTitleStyle';

describe('resolveDeckTitleStyle', () => {
  it('applies every default when title is unset', () => {
    expect(resolveDeckTitleStyle(undefined)).toEqual({
      show: false,
      align: 'middle',
      fontFamily: '',
      size: DECK_TITLE_SIZE_DEFAULT,
      bold: false,
      italic: false,
      underline: false,
      color: '#ffffff',
    });
  });

  it('carries through every explicit override', () => {
    const resolved = resolveDeckTitleStyle({
      show: false, align: 'top', font: 'arial', size: 22, bold: true, italic: true, underline: true, color: '#ff0000',
    });
    expect(resolved).toEqual({
      show: false,
      align: 'top',
      fontFamily: 'Arial, Helvetica, sans-serif',
      size: 22,
      bold: true,
      italic: true,
      underline: true,
      color: '#ff0000',
    });
  });

  it('falls back to the default font family for an unknown font id', () => {
    expect(resolveDeckTitleStyle({ font: 'not-a-real-font' }).fontFamily).toBe('');
  });

  it('clamps a size outside the allowed range', () => {
    expect(resolveDeckTitleStyle({ size: 1 }).size).toBe(DECK_TITLE_SIZE_MIN);
    expect(resolveDeckTitleStyle({ size: 999 }).size).toBe(DECK_TITLE_SIZE_MAX);
  });
});

describe('titleFontSizeCss', () => {
  it('produces a clamp() using the size as the cqmin term', () => {
    expect(titleFontSizeCss(16)).toBe('clamp(10px, 16cqmin, 21px)');
  });

  it('clamps the input size before building the string', () => {
    expect(titleFontSizeCss(0)).toBe(titleFontSizeCss(DECK_TITLE_SIZE_MIN));
    expect(titleFontSizeCss(1000)).toBe(titleFontSizeCss(DECK_TITLE_SIZE_MAX));
  });
});
