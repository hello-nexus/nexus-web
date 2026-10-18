// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampFreeformSize,
  cornerRoom,
  freeformSnapSpans,
  moveRect,
  resizeRectFromCorner,
  spanToSize,
  type FreeformRect,
} from './freeformResize';
import { sizeToSpan } from './grid';
import { isFreeformWidgetSize, normalizePanelWidgetSize, parseWidgetSizeSpan } from '../types';

const names = (spans: { cols: number; rows: number }[]) => spans.map(spanToSize).sort();

describe('freeformSnapSpans', () => {
  it('offers the declared sizes plus even spans of at least 4 on a 4 wide grid', () => {
    const spans = freeformSnapSpans(['4x2', '4x4'], { cols: 4, rows: 8 });
    expect(names(spans)).toEqual(['4x2', '4x4', '4x6', '4x8']);
  });

  it('adds the wide spans on an 8 wide grid', () => {
    const spans = names(freeformSnapSpans(['4x2', '4x4'], { cols: 8, rows: 8 }));
    expect(spans).toEqual([
      '4x2', '4x4', '4x6', '4x8',
      '6x4', '6x6', '6x8',
      '8x4', '8x6', '8x8',
    ].sort());
  });

  it('caps every span by the grid, declared sizes included', () => {
    const spans = freeformSnapSpans(['4x2', '4x4'], { cols: 4, rows: 4 });
    expect(names(spans)).toEqual(['4x2', '4x4']);
    expect(names(freeformSnapSpans(['4x4'], { cols: 2, rows: 8 }))).toEqual([]);
  });

  it('never offers the round mask as a span', () => {
    expect(names(freeformSnapSpans(['2x2round'], { cols: 4, rows: 2 }))).toEqual([]);
  });
});

describe('freeformSnapSpans without the even spans', () => {
  it('offers only the declared sizes that fit the grid', () => {
    const declared = ['2x2', '4x2', '4x4'] as const;
    expect(names(freeformSnapSpans(declared, { cols: 8, rows: 8 }, false))).toEqual(['2x2', '4x2', '4x4']);
    expect(names(freeformSnapSpans(declared, { cols: 4, rows: 2 }, false))).toEqual(['2x2', '4x2']);
  });

  it('gives a widget with one fitting size nothing to resize to', () => {
    expect(freeformSnapSpans(['4x4'], { cols: 8, rows: 8 }, false)).toHaveLength(1);
    expect(freeformSnapSpans(['2x2round'], { cols: 8, rows: 8 }, false)).toHaveLength(0);
  });

  it('computes corner room from the declared sizes only', () => {
    const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], { cols: 8, rows: 8 }, false);
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, snap, { cols: 8, rows: 8 })).toEqual({ tl: false, tr: false, bl: false, br: false });
    expect(cornerRoom({ col: 2, row: 2, cols: 2, rows: 2 }, snap, { cols: 8, rows: 8 })).toEqual({ tl: true, tr: true, bl: true, br: true });
  });

  it('resizes a corner to the nearest declared size', () => {
    const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], { cols: 8, rows: 8 }, false);
    expect(resizeRectFromCorner({ col: 0, row: 0, cols: 2, rows: 2 }, 'br', 2, 2, snap, { cols: 8, rows: 8 })).toEqual({ col: 0, row: 0, cols: 4, rows: 4 });
    expect(resizeRectFromCorner({ col: 4, row: 4, cols: 4, rows: 4 }, 'tl', 2, 2, snap, { cols: 8, rows: 8 })).toEqual({ col: 6, row: 6, cols: 2, rows: 2 });
  });
});

describe('resizeRectFromCorner', () => {
  const bounds = { cols: 8, rows: 8 };
  const snap = freeformSnapSpans(['4x2', '4x4'], bounds);
  const start: FreeformRect = { col: 2, row: 2, cols: 4, rows: 4 };

  it('grows from the bottom right and keeps the origin', () => {
    expect(resizeRectFromCorner(start, 'br', 2, 0, snap, bounds)).toEqual({ col: 2, row: 2, cols: 6, rows: 4 });
  });

  it('grows from the top left and shifts the origin up and left', () => {
    expect(resizeRectFromCorner(start, 'tl', -2, -2, snap, bounds)).toEqual({ col: 0, row: 0, cols: 6, rows: 6 });
  });

  it('shrinking from the top right moves the origin down and keeps the left edge', () => {
    expect(resizeRectFromCorner(start, 'tr', 0, 2, snap, bounds)).toEqual({ col: 2, row: 4, cols: 4, rows: 2 });
  });

  it('shrinking from the bottom left moves the origin right and keeps the top and right edges', () => {
    const wide: FreeformRect = { col: 0, row: 1, cols: 8, rows: 4 };
    expect(resizeRectFromCorner(wide, 'bl', 4, -2, snap, bounds)).toEqual({ col: 4, row: 1, cols: 4, rows: 2 });
  });

  it('snaps to the nearest span instead of following the pointer exactly', () => {
    expect(resizeRectFromCorner(start, 'br', 0.4, 0.4, snap, bounds)).toEqual(start);
    expect(resizeRectFromCorner(start, 'br', 1.2, 0, snap, bounds)).toEqual({ col: 2, row: 2, cols: 6, rows: 4 });
  });

  it('never leaves the grid: a span that would cross an edge is not a candidate', () => {
    const atEdge: FreeformRect = { col: 4, row: 0, cols: 4, rows: 4 };
    expect(resizeRectFromCorner(atEdge, 'br', 4, 0, snap, bounds)).toEqual(atEdge);
    expect(resizeRectFromCorner(atEdge, 'tl', -6, 0, snap, bounds)).toEqual({ col: 0, row: 0, cols: 8, rows: 4 });
  });

  it('returns the start rect when no span fits', () => {
    expect(resizeRectFromCorner(start, 'br', 1, 1, [], bounds)).toEqual(start);
  });

  it('prefers the smaller span on a tie', () => {
    const tied = resizeRectFromCorner({ col: 0, row: 0, cols: 4, rows: 4 }, 'br', 1, 0, snap, bounds);
    expect(tied).toEqual({ col: 0, row: 0, cols: 4, rows: 4 });
  });
});

describe('moveRect', () => {
  const bounds = { cols: 8, rows: 8 };
  const start: FreeformRect = { col: 2, row: 2, cols: 4, rows: 4 };

  it('moves in whole cells', () => {
    expect(moveRect(start, 1.4, -0.6, bounds)).toEqual({ col: 3, row: 1, cols: 4, rows: 4 });
  });

  it('stops at the grid edges', () => {
    expect(moveRect(start, 9, 9, bounds)).toEqual({ col: 4, row: 4, cols: 4, rows: 4 });
    expect(moveRect(start, -9, -9, bounds)).toEqual({ col: 0, row: 0, cols: 4, rows: 4 });
  });
});

describe('freeform size strings', () => {
  it('parses cols x rows', () => {
    expect(parseWidgetSizeSpan('6x4')).toEqual({ cols: 6, rows: 4 });
    expect(sizeToSpan('6x4')).toEqual({ cols: 6, rows: 4 });
    expect(sizeToSpan('4x6')).toEqual({ cols: 4, rows: 6 });
  });

  it('rejects malformed and absurd strings', () => {
    for (const bad of ['', '6', '6x', 'x4', '0x4', '4x0', '6X4', '6x4x2', '99x4', '4x99', ' 6x4']) {
      expect(parseWidgetSizeSpan(bad), bad).toBeNull();
    }
  });

  it('keeps the fixed enum out of the freeform set', () => {
    expect(isFreeformWidgetSize('4x4')).toBe(false);
    expect(isFreeformWidgetSize('2x2round')).toBe(false);
    expect(isFreeformWidgetSize('6x4')).toBe(true);
  });

  it('passes a valid span through normalize and falls back on junk', () => {
    expect(normalizePanelWidgetSize('6x4')).toBe('6x4');
    expect(normalizePanelWidgetSize('junk')).toBe('4x4');
  });
});

describe('clampFreeformSize', () => {
  it('shrinks a span to the grid and leaves the fixed sizes alone', () => {
    expect(clampFreeformSize('8x6', { cols: 4, rows: 16 })).toBe('4x6');
    expect(clampFreeformSize('6x8', { cols: 8, rows: 4 })).toBe('6x4');
    expect(clampFreeformSize('6x4', { cols: 8, rows: 8 })).toBe('6x4');
    expect(clampFreeformSize('4x4', { cols: 2, rows: 2 })).toBe('4x4');
  });
});

describe('cornerRoom', () => {
  const snap = freeformSnapSpans(['4x2', '4x4'], { cols: 8, rows: 8 });
  const bounds = { cols: 8, rows: 8 };

  it('enables every corner of a tile with room all round', () => {
    expect(cornerRoom({ col: 2, row: 2, cols: 4, rows: 4 }, snap, bounds)).toEqual({ tl: true, tr: true, bl: true, br: true });
  });

  it('disables the corners on an edge the tile already touches when no larger span fits', () => {
    const full = cornerRoom({ col: 0, row: 0, cols: 8, rows: 8 }, snap, bounds);
    expect(full).toEqual({ tl: false, tr: false, bl: false, br: false });
  });

  it('disables a corner whose growth would cross the grid edge', () => {
    expect(cornerRoom({ col: 4, row: 0, cols: 4, rows: 4 }, snap, bounds)).toEqual({ tl: true, tr: false, bl: true, br: true });
    expect(cornerRoom({ col: 4, row: 2, cols: 4, rows: 6 }, snap, { cols: 8, rows: 8 })).toEqual({ tl: true, tr: true, bl: true, br: false });
  });

  it('uses the whole grid width on a 4 wide grid and only grows by rows', () => {
    const narrow = freeformSnapSpans(['4x2', '4x4'], { cols: 4, rows: 8 });
    expect(cornerRoom({ col: 0, row: 2, cols: 4, rows: 4 }, narrow, { cols: 4, rows: 8 })).toEqual({ tl: true, tr: true, bl: true, br: true });
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 8 }, narrow, { cols: 4, rows: 8 })).toEqual({ tl: false, tr: false, bl: false, br: false });
  });

  it('counts no room when nothing larger is offered', () => {
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, [], bounds)).toEqual({ tl: false, tr: false, bl: false, br: false });
  });
});
