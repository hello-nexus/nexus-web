// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampFreeformSize,
  cornerRoom,
  freeformSnapSpans,
  resizeRectFromCorner,
  stepRectFromCorner,
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
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, snap, { cols: 8, rows: 8 })).toEqual({ tl: true, tr: true, bl: true, br: true });
    expect(cornerRoom({ col: 2, row: 2, cols: 2, rows: 2 }, snap, { cols: 8, rows: 8 })).toEqual({ tl: true, tr: true, bl: true, br: true });
  });

  it('resizes a corner to the nearest declared size', () => {
    const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], { cols: 8, rows: 8 }, false);
    expect(resizeRectFromCorner({ col: 0, row: 0, cols: 2, rows: 2 }, 'br', 2, 2, snap, { cols: 8, rows: 8 })).toEqual({ col: 0, row: 0, cols: 4, rows: 4 });
    expect(resizeRectFromCorner({ col: 4, row: 4, cols: 4, rows: 4 }, 'tl', 2, 2, snap, { cols: 8, rows: 8 })).toEqual({ col: 6, row: 6, cols: 2, rows: 2 });
  });

  describe('ratio lock', () => {
    const noCheck = undefined;
    it('follows the axis that moved further and keeps the ratio', () => {
      const snap = freeformSnapSpans(['2x2', '4x2', '4x4', '8x4'], { cols: 8, rows: 8 }, false);
      const b = { cols: 8, rows: 8 };
      const start = { col: 0, row: 0, cols: 4, rows: 2 };
      expect(resizeRectFromCorner(start, 'br', 4, 0, snap, b, noCheck, true)).toEqual({ col: 0, row: 0, cols: 8, rows: 4 });
      expect(resizeRectFromCorner(start, 'br', 0, 0, snap, b, noCheck, true)).toEqual(start);
    });

    it('shrinks from the far edge with the opposite corner anchored', () => {
      const snap = freeformSnapSpans(['2x2', '4x2', '4x4', '8x4'], { cols: 8, rows: 8 }, false);
      const r = resizeRectFromCorner({ col: 0, row: 0, cols: 8, rows: 4 }, 'tl', 4, 0, snap, { cols: 8, rows: 8 }, noCheck, true);
      expect(r).toEqual({ col: 4, row: 2, cols: 4, rows: 2 });
    });

    it('caps the scale to the room at the grid edge instead of distorting', () => {
      const snap = freeformSnapSpans(['4x4'], { cols: 8, rows: 8 }, true);
      const r = resizeRectFromCorner({ col: 4, row: 0, cols: 4, rows: 4 }, 'br', 0, 2, snap, { cols: 8, rows: 8 }, noCheck, true);
      expect(r).toEqual({ col: 4, row: 0, cols: 4, rows: 4 });
    });

    it('keeps the ratio with even spans where plain snapping would not', () => {
      const bounds = { cols: 12, rows: 8 };
      const snap = freeformSnapSpans([], bounds, true);
      const start = { col: 0, row: 0, cols: 6, rows: 4 };
      expect(resizeRectFromCorner(start, 'br', 2, 4 / 3, snap, bounds, noCheck, false)).toEqual({ col: 0, row: 0, cols: 8, rows: 6 });
      expect(resizeRectFromCorner(start, 'br', 2, 4 / 3, snap, bounds, noCheck, true)).toEqual(start);
      expect(resizeRectFromCorner(start, 'br', 6, 0, snap, bounds, noCheck, true)).toEqual({ col: 0, row: 0, cols: 12, rows: 8 });
    });

    it('falls back to the least ratio error when the start size is not a snap span', () => {
      const snap = freeformSnapSpans(['4x4', '8x4'], { cols: 8, rows: 8 }, false);
      const r = resizeRectFromCorner({ col: 0, row: 0, cols: 6, rows: 4 }, 'br', 2, 0, snap, { cols: 8, rows: 8 }, noCheck, true);
      expect(r).toEqual({ col: 0, row: 0, cols: 8, rows: 4 });
    });
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
  const bounds = { cols: 8, rows: 8 };
  const all = { tl: true, tr: true, bl: true, br: true };
  const none = { tl: false, tr: false, bl: false, br: false };
  const declared = freeformSnapSpans(['2x2', '4x2', '4x4'], bounds, false);

  it('dims every corner of the smallest size when nothing larger fits', () => {
    expect(cornerRoom({ col: 0, row: 0, cols: 2, rows: 2 }, [{ cols: 2, rows: 2 }, { cols: 4, rows: 4 }], { cols: 3, rows: 3 })).toEqual(none);
  });

  it('keeps the smallest size enabled where it has room to grow', () => {
    expect(cornerRoom({ col: 2, row: 2, cols: 2, rows: 2 }, declared, bounds)).toEqual(all);
    const corner = cornerRoom({ col: 0, row: 0, cols: 2, rows: 2 }, declared, bounds);
    expect(corner.br).toBe(true);
  });

  it('keeps a size above the smallest enabled against the grid edge, since it can shrink', () => {
    expect(cornerRoom({ col: 4, row: 4, cols: 4, rows: 4 }, declared, bounds)).toEqual(all);
    expect(cornerRoom({ col: 0, row: 0, cols: 8, rows: 8 }, freeformSnapSpans(['4x2', '4x4'], bounds), bounds)).toEqual(all);
  });

  it('enables every corner of the largest declared size', () => {
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, declared, bounds)).toEqual(all);
  });

  it('dims everything when no other span is offered', () => {
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, [{ cols: 4, rows: 4 }], bounds)).toEqual(none);
    expect(cornerRoom({ col: 0, row: 0, cols: 4, rows: 4 }, [], bounds)).toEqual(none);
  });
});

describe('stepRectFromCorner', () => {
  const bounds = { cols: 8, rows: 8 };
  const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], bounds);
  const at = (cols: number, rows: number) => ({ col: 0, row: 0, cols, rows });

  it('steps a corner outward to the next span on the stepped axis', () => {
    expect(stepRectFromCorner(at(4, 4), 'br', 1, 0, snap, bounds)).toEqual(at(6, 4));
    expect(stepRectFromCorner(at(2, 2), 'br', 1, 0, snap, bounds)).toEqual(at(4, 2));
    expect(stepRectFromCorner(at(4, 2), 'br', 0, 1, snap, bounds)).toEqual(at(4, 4));
  });

  it('steps inward to shrink and moves the origin for a left or top corner', () => {
    expect(stepRectFromCorner(at(4, 4), 'br', -1, 0, snap, bounds)).toEqual(at(2, 2));
    const moved = stepRectFromCorner({ col: 2, row: 2, cols: 4, rows: 4 }, 'tl', -1, 0, snap, bounds);
    expect(moved).toEqual({ col: 0, row: 2, cols: 6, rows: 4 });
  });

  it('stays put when no span lies that way', () => {
    expect(stepRectFromCorner({ col: 4, row: 0, cols: 4, rows: 4 }, 'br', 1, 0, snap, bounds)).toEqual({ col: 4, row: 0, cols: 4, rows: 4 });
  });
});

describe('cornerRoom with a placement check', () => {
  const bounds = { cols: 8, rows: 8 };
  const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], bounds, false);

  it('dims a corner when every span it reaches is refused', () => {
    const start = { col: 0, row: 0, cols: 4, rows: 4 };
    const none = cornerRoom(start, snap, bounds, () => false);
    expect(none).toEqual({ tl: false, tr: false, bl: false, br: false });
    const some = cornerRoom(start, snap, bounds, rect => rect.cols <= 2);
    expect(some.br).toBe(true);
  });

  it('keeps the drag from picking a refused span and takes the largest one allowed', () => {
    const start = { col: 0, row: 0, cols: 2, rows: 2 };
    const refuse44 = (rect: { cols: number; rows: number }) => !(rect.cols === 4 && rect.rows === 4);
    expect(resizeRectFromCorner(start, 'br', 4, 4, snap, bounds, refuse44)).toEqual({ col: 0, row: 0, cols: 4, rows: 2 });
    expect(stepRectFromCorner(start, 'br', 1, 1, snap, bounds, refuse44)).toEqual(start);
  });
});

describe('corner origin stride rules shared with the regular drag', () => {
  const bounds = { cols: 8, rows: 8 };
  const snap = freeformSnapSpans(['2x2', '4x2', '4x4'], bounds, false);

  it('leaves a tile whose origin is off the stride grid where it is rather than moving the origin off-grid', () => {
    // Growing from the top left of a 2x2 at col 3 would put the origin at col 1.
    const start = { col: 3, row: 2, cols: 2, rows: 2 };
    expect(resizeRectFromCorner(start, 'tl', -2, -2, snap, bounds)).toEqual(start);
  });

  it('moves the origin to a stride aligned cell for an aligned tile', () => {
    expect(resizeRectFromCorner({ col: 4, row: 4, cols: 2, rows: 2 }, 'tl', -2, -2, snap, bounds))
      .toEqual({ col: 2, row: 2, cols: 4, rows: 4 });
  });
});
