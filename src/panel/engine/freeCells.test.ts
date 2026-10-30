import { describe, expect, it } from 'vitest';
import type { PanelWidget } from '../types';
import { freeCells, splitOrientation } from './freeCells';
import { SINGLE_WIDGET_SURFACE_SIZE } from '../types';
import { sizeToSpan } from './grid';

const widget = (col: number, row: number, size: PanelWidget['size']): PanelWidget => ({ id: `${col}${row}${size}`, type: 'clock', size, col, row });

describe('freeCells', () => {
  it('lists every cell of an empty page in reading order', () => {
    expect(freeCells([], 2, 2)).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
  });

  it('skips cells covered by a multi-cell widget', () => {
    const free = freeCells([widget(0, 0, '2x2')], 4, 2);
    expect(free).toEqual([{ col: 2, row: 0 }, { col: 3, row: 0 }, { col: 2, row: 1 }, { col: 3, row: 1 }]);
  });

  it('returns nothing when widgets fill the grid', () => {
    expect(freeCells([widget(0, 0, '4x2')], 4, 2)).toEqual([]);
  });

  it('ignores widget cells that fall outside the grid', () => {
    expect(freeCells([widget(0, 0, '4x4')], 2, 2)).toEqual([]);
  });
});

describe('splitOrientation', () => {
  it('stacks for tall and square tiles', () => {
    expect(splitOrientation(2, 4)).toBe('stacked');
    expect(splitOrientation(2, 2)).toBe('stacked');
  });

  it('puts the halves side by side for wide tiles', () => {
    expect(splitOrientation(4, 2)).toBe('side');
  });

  it('picks side only for the wide cooler surface', () => {
    const orientation = (surface: keyof typeof SINGLE_WIDGET_SURFACE_SIZE) => {
      const span = sizeToSpan(SINGLE_WIDGET_SURFACE_SIZE[surface]!);
      return splitOrientation(span.cols, span.rows);
    };
    expect(orientation('lcd-wide')).toBe('side');
    expect(orientation('q60')).toBe('stacked');
    expect(orientation('lcd-round')).toBe('stacked');
    expect(orientation('lcd-square')).toBe('stacked');
  });
});
