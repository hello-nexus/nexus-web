import { describe, expect, it } from 'vitest';
import {
  dockRowsForGrid,
  paginateCapacityForGrid,
  flattenPages,
  repaginatePanelLayout,
  firstFreeRect,
  rectsOverlap,
} from './paginate';
import type { PanelLayout, PanelPage, PanelWidget, PanelWidgetSize } from '../types';

function widget(size: PanelWidgetSize, col: number, row: number, id?: string): PanelWidget {
  return { id: id ?? `w-${col}-${row}`, type: 'clock', size, col, row };
}

const COLS = 4;

describe('rectsOverlap', () => {
  it('returns true for two rects that share at least one cell', () => {
    expect(rectsOverlap(
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
    )).toBe(true);
  });

  it('returns false for rects that share an edge but no cells', () => {
    expect(rectsOverlap(
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 2, row: 0, colSpan: 2, rowSpan: 2 },
    )).toBe(false);
  });
});

describe('firstFreeRect', () => {
  it('returns (0,0) when the grid is empty', () => {
    expect(firstFreeRect([], COLS, 8, 2, 2)).toEqual({ col: 0, row: 0 });
  });

  it('skips occupied cells and returns the next row-major free spot', () => {
    const existing = [widget('2x2', 0, 0)];
    expect(firstFreeRect(existing, COLS, 8, 2, 2)).toEqual({ col: 2, row: 0 });
  });

  it('returns the first below-row spot when the row is full', () => {
    const existing = [widget('2x2', 0, 0), widget('2x2', 2, 0)];
    expect(firstFreeRect(existing, COLS, 8, 2, 2)).toEqual({ col: 0, row: 2 });
  });

  it('returns null when no rect fits within the grid', () => {
    const existing = [widget('4x4', 0, 0), widget('4x4', 0, 4)];
    expect(firstFreeRect(existing, COLS, 8, 4, 4)).toBeNull();
  });

  it('places a 4x4 at the first free 2-cell slot, not the next 4-cell slot', () => {
    // Wide grid (8x8) with a 2x2 blocking the top-left corner. Old
    // span-stride logic skipped col 2 because 4x4 was locked to
    // multiples of 4; the 2-cell stride lets the widget slide into
    // the empty col-2 slot.
    const existing = [widget('2x2', 0, 0)];
    expect(firstFreeRect(existing, 8, 8, 4, 4)).toEqual({ col: 2, row: 0 });
  });

  it('respects gaps - finds an interior empty rect first if it fits', () => {
    // Two 2x2s at the corners of an 8-row page; a 2x2 fits at (2,0).
    const existing = [widget('2x2', 0, 0), widget('0', 0, 0)];
    void existing;
    const placed = [widget('2x2', 0, 0), widget('2x2', 0, 6)];
    expect(firstFreeRect(placed, COLS, 8, 2, 2)).toEqual({ col: 2, row: 0 });
  });
});

describe('dockRowsForGrid', () => {
  it('reserves 1 row for portrait grids when enabled', () => {
    expect(dockRowsForGrid(4, 8, true)).toBe(1);
    expect(dockRowsForGrid(4, 12, true)).toBe(1);
  });

  it('reserves 1 row for landscape grids when enabled', () => {
    expect(dockRowsForGrid(8, 4, true)).toBe(1);
  });

  it('returns 0 when the dock is disabled', () => {
    expect(dockRowsForGrid(4, 8, false)).toBe(0);
  });
});

describe('paginateCapacityForGrid', () => {
  it('shaves a row in portrait when the dock is enabled', () => {
    expect(paginateCapacityForGrid(4, 8, true, 'portrait')).toEqual({ gridCols: 4, pageRows: 7 });
  });

  it('shaves a column in landscape when the dock is enabled', () => {
    expect(paginateCapacityForGrid(8, 4, true, 'landscape')).toEqual({ gridCols: 7, pageRows: 4 });
  });

  it('returns full grid dimensions when the dock is disabled', () => {
    expect(paginateCapacityForGrid(4, 8, false, 'portrait')).toEqual({ gridCols: 4, pageRows: 8 });
    expect(paginateCapacityForGrid(8, 4, false, 'landscape')).toEqual({ gridCols: 8, pageRows: 4 });
  });

  it('clamps to at least 1 unit to keep the renderer from dividing by zero', () => {
    expect(paginateCapacityForGrid(1, 4, true, 'landscape').gridCols).toBeGreaterThanOrEqual(1);
    expect(paginateCapacityForGrid(4, 1, true, 'portrait').pageRows).toBeGreaterThanOrEqual(1);
  });
});

describe('flattenPages', () => {
  it('walks pages in order, sorted row-major within each page', () => {
    const pages: PanelPage[] = [
      { id: 'p1', widgets: [widget('1x1', 2, 0, 'a'), widget('1x1', 0, 0, 'b')] },
      { id: 'p2', widgets: [widget('1x1', 1, 1, 'c'), widget('1x1', 0, 1, 'd')] },
    ];
    const flat = flattenPages(pages);
    expect(flat.map(w => w.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('repaginatePanelLayout', () => {
  function layoutWith(widgets: PanelWidget[]): PanelLayout {
    return {
      layoutSchemaVersion: 2,
      surface: 'phone',
      pages: [{ id: 'first', widgets }],
    };
  }

  it('returns the same layout reference when no widget needs clamping', () => {
    const w1 = widget('2x2', 0, 0, 'a');
    const w2 = widget('2x2', 2, 0, 'b');
    const layout = layoutWith([w1, w2]);
    const next = repaginatePanelLayout(layout, { gridCols: COLS, pageRows: 8 });
    expect(next).toBe(layout);
  });

  it('clamps widgets whose col is past the right edge after a capacity shrink', () => {
    // A 2x2 saved at col=6 on an old 8-col grid; capacity shrinks to 4 cols.
    const w = widget('2x2', 6, 0, 'a');
    const layout = layoutWith([w]);
    const next = repaginatePanelLayout(layout, { gridCols: COLS, pageRows: 8 });
    expect(next.pages[0].widgets[0].col).toBe(2);
    expect(next).not.toBe(layout);
  });

  it('clamps widgets whose row is past the bottom edge', () => {
    const w = widget('2x2', 0, 10, 'a');
    const layout = layoutWith([w]);
    const next = repaginatePanelLayout(layout, { gridCols: COLS, pageRows: 8 });
    expect(next.pages[0].widgets[0].row).toBeLessThanOrEqual(6);
  });

  it('preserves explicit gaps - no auto-flow on capacity changes', () => {
    const w1 = widget('1x1', 0, 0, 'a');
    const w2 = widget('1x1', 0, 5, 'b');
    const layout = layoutWith([w1, w2]);
    const next = repaginatePanelLayout(layout, { gridCols: COLS, pageRows: 8 });
    // Gap between rows 0 and 5 stays.
    expect(next.pages[0].widgets[0].row).toBe(0);
    expect(next.pages[0].widgets[1].row).toBe(5);
  });
});
