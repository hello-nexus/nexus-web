import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { getKeyGlyph } from './keebGlyphs';
import type { KeebLayoutKind } from './keebGlyphs';
import { getKeebLayoutRows } from './keebLayout';

const LAYOUTS: readonly KeebLayoutKind[] = ['ANSI', 'ISO'];

// The implementation intentionally renders these as an empty string; every
// other function on the physical board must produce a visible glyph.
const INTENTIONALLY_BLANK = new Set(['None']);

function boardFunctions(layout: KeebLayoutKind): string[] {
  return getKeebLayoutRows(layout).flat().map(key => key.function);
}

describe('getKeyGlyph over the physical board', () => {
  for (const layout of LAYOUTS) {
    it(`renders a non-blank glyph for every ${layout} key`, () => {
      const fns = boardFunctions(layout);
      expect(fns.length).toBeGreaterThan(80); // sanity: full TKL+pad board
      for (const fn of fns) {
        if (INTENTIONALLY_BLANK.has(fn)) continue;
        const glyph = getKeyGlyph(fn, layout);
        expect(glyph, `${layout} key '${fn}' rendered blank`).toBeTruthy();
      }
    });
  }

  it('maps None (and the empty function) to an empty string by design', () => {
    expect(getKeyGlyph('None')).toBe('');
    expect(getKeyGlyph('')).toBe('');
    // Keep the skip list honest: every skipped function must actually be on
    // the board somewhere, otherwise the entry is dead weight.
    const onBoard = new Set([...boardFunctions('ANSI'), ...boardFunctions('ISO')]);
    for (const fn of INTENTIONALLY_BLANK) {
      expect(onBoard.has(fn), `'${fn}' is in the skip list but not on the board`).toBe(true);
    }
  });
});

describe('ANSI vs ISO overrides', () => {
  it('swaps the documented legend strings', () => {
    expect(getKeyGlyph('Backtick', 'ANSI')).toBe('` ~');
    expect(getKeyGlyph('Backtick', 'ISO')).toBe('` ¬');
    expect(getKeyGlyph('Number2', 'ANSI')).toBe('2 @');
    expect(getKeyGlyph('Number2', 'ISO')).toBe('2 "');
    expect(getKeyGlyph('Number3', 'ANSI')).toBe('3 #');
    expect(getKeyGlyph('Number3', 'ISO')).toBe('3 £');
    expect(getKeyGlyph('Quote', 'ANSI')).toBe('\' "');
    expect(getKeyGlyph('Quote', 'ISO')).toBe('\' @');
    expect(getKeyGlyph('Return', 'ANSI')).toBe('Enter');
    expect(getKeyGlyph('Return', 'ISO')).toBe('↵ Enter');
    expect(getKeyGlyph('LeftShift', 'ANSI')).toBe('Shift');
    expect(getKeyGlyph('LeftShift', 'ISO')).toBe('⇧');
    expect(getKeyGlyph('RightShift', 'ANSI')).toBe('Shift');
    expect(getKeyGlyph('RightShift', 'ISO')).toBe('⇧');
    expect(getKeyGlyph('Tab', 'ANSI')).toBe('Tab');
    expect(getKeyGlyph('Tab', 'ISO')).toBe('Tab ↹');
    expect(getKeyGlyph('Backspace', 'ANSI')).toBe('Backspace');
    expect(getKeyGlyph('Backspace', 'ISO')).toBe('⌫');
  });

  it('defaults to the ANSI legend when no layout is given', () => {
    expect(getKeyGlyph('Backtick')).toBe('` ~');
    expect(getKeyGlyph('Return')).toBe('Enter');
  });

  it('keeps layout-independent legends identical across layouts', () => {
    for (const fn of ['Escape', 'Space', 'CapsLock', 'F1', 'A']) {
      expect(getKeyGlyph(fn, 'ANSI'), fn).toBe(getKeyGlyph(fn, 'ISO'));
    }
  });
});

describe('icon glyphs', () => {
  it('renders arrows and other icon-backed functions as React elements', () => {
    const iconFns = [
      'UpArrow', 'DownArrow', 'LeftArrow', 'RightArrow',
      'PassThrough', 'Mute', 'VolumeUp', 'VolumeDown', 'PlayAndPause',
      'MouseWheelUp', 'MouseWheelDown', 'Power', 'Sleep',
      'RGBOnOff', 'RGBEffectLoop', 'ProfileValue',
    ];
    for (const fn of iconFns) {
      expect(isValidElement(getKeyGlyph(fn)), `${fn} should be an element`).toBe(true);
    }
  });

  it('renders plain-text legends as strings, not elements', () => {
    for (const fn of ['Escape', 'CapsLock', 'MOSwitch', 'Macro7']) {
      expect(typeof getKeyGlyph(fn), fn).toBe('string');
    }
  });
});

describe('fallback behavior', () => {
  it('returns the raw function name for unknown functions', () => {
    expect(getKeyGlyph('SomeFutureFirmwareKey')).toBe('SomeFutureFirmwareKey');
  });

  it('passes through F-keys, letters, and International keys as-is', () => {
    for (const fn of ['F13', 'F24', 'A', 'Z', 'International1', 'Lang1']) {
      expect(getKeyGlyph(fn)).toBe(fn);
    }
  });

  it('shows macro keys as their bare number', () => {
    expect(getKeyGlyph('Macro1')).toBe('1');
    expect(getKeyGlyph('Macro16')).toBe('16');
  });
});
