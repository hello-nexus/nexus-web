import { describe, expect, it } from 'vitest';
import {
  flattenPages,
  repaginatePanelLayout,
  firstFreeRect,
  rectsOverlap,
} from './paginate';
import { sizeToSpan } from './grid';
import type { PanelLayout, PanelPage, PanelWidget, PanelWidgetSize } from '../types';

function widget(size: PanelWidgetSize, col: number, row: number, id?: string): PanelWidget {
  return { id: id ?? `w-${col}-${row}`, type: 'clock', size, col, row };
}

// "Clip" = a widget out of the grid OR two widgets overlapping. The whole
// point of the reflow is that neither happens after a rotation.
function assertNoClip(widgets: readonly PanelWidget[], cols: number, rows: number) {
  const rects = widgets.map(w => {
    const span = sizeToSpan(w.size);
    return {
      id: w.id,
      col: w.col,
      row: w.row,
      colSpan: Math.max(1, Math.min(span.cols, cols)),
      rowSpan: Math.max(1, span.rows),
    };
  });
  for (const r of rects) {
    expect.soft(r.col, `${r.id} left edge`).toBeGreaterThanOrEqual(0);
    expect.soft(r.row, `${r.id} top edge`).toBeGreaterThanOrEqual(0);
    expect.soft(r.col + r.colSpan, `${r.id} right edge within ${cols} cols`).toBeLessThanOrEqual(cols);
    expect.soft(r.row + r.rowSpan, `${r.id} bottom edge within ${rows} rows`).toBeLessThanOrEqual(rows);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect.soft(rectsOverlap(rects[i], rects[j]), `${rects[i].id} overlaps ${rects[j].id}`).toBe(false);
    }
  }
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
    // Wide grid (8x8) with a 2x2 blocking the top-left corner. The
    // 2-cell stride lets the 4x4 slide into the empty col-2 slot
    // instead of jumping to the next multiple-of-4 column.
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

  it('packs the stock phone stack top-to-bottom in landscape (no clip)', () => {
    // Three full-width 4x2 widgets stacked vertically in portrait. Rotating
    // to an 8x4 landscape grid, the flow runs top-to-bottom then rightward.
    const mon = widget('4x2', 0, 0, 'mon');
    const light = widget('4x2', 0, 2, 'light');
    const cool = widget('4x2', 0, 4, 'cool');
    const next = repaginatePanelLayout(layoutWith([mon, light, cool]), { gridCols: 8, pageRows: 4 });
    const byId = Object.fromEntries(next.pages[0].widgets.map(w => [w.id, w]));
    expect(byId.mon).toMatchObject({ col: 0, row: 0 });
    expect(byId.light).toMatchObject({ col: 0, row: 2 });
    expect(byId.cool).toMatchObject({ col: 4, row: 0 });
    assertNoClip(next.pages[0].widgets, 8, 4);
  });

  it('packs the connected-iPhone page-1 layout into landscape with no crop and no empty slot', () => {
    // The real device case: 4x2 monitor on top, two 2x2s, one 4x4. Row-major
    // packing cropped the 4x4 and left a 2x4 hole; top-to-bottom fills 8x4.
    const mon = widget('4x2', 0, 0, 'mon');
    const clock = widget('2x2', 0, 2, 'clock');
    const media = widget('2x2', 2, 2, 'media');
    const lighting = widget('4x4', 0, 4, 'lighting');
    const next = repaginatePanelLayout(layoutWith([mon, clock, media, lighting]), { gridCols: 8, pageRows: 4 });
    const byId = Object.fromEntries(next.pages[0].widgets.map(w => [w.id, w]));
    expect(byId.mon).toMatchObject({ col: 0, row: 0 });
    expect(byId.clock).toMatchObject({ col: 0, row: 2 });
    expect(byId.media).toMatchObject({ col: 2, row: 2 });
    expect(byId.lighting).toMatchObject({ col: 4, row: 0 });
    assertNoClip(next.pages[0].widgets, 8, 4);
  });

  it('is a no-op (same reference) once a layout already fits the grid', () => {
    // Idempotence guards the persist effect against a render loop.
    const layout = layoutWith([widget('4x2', 0, 0, 'mon'), widget('2x2', 0, 2, 'clock'),
      widget('2x2', 2, 2, 'media'), widget('4x4', 0, 4, 'lighting')]);
    const landscape = repaginatePanelLayout(layout, { gridCols: 8, pageRows: 4 });
    expect(repaginatePanelLayout(landscape, { gridCols: 8, pageRows: 4 })).toBe(landscape);
  });

  it('stays a fixed point for an over-capacity page (no persist render-loop)', () => {
    // 45 cells of widgets into a 32-cell (4x8) grid: packing can't fit it,
    // so the result must still settle to a stable reference on re-run rather
    // than re-trigger setLayout every render.
    const cells: Array<[PanelWidgetSize, number, number]> = [
      ['4x4', 3, 1], ['4x2', 5, 1], ['2x4', 5, 4], ['4x2', 2, 11], ['2x2', 1, 11], ['1x1', 1, 4],
    ];
    const layout = layoutWith(cells.map(([s, c, r], i) => widget(s, c, r, `w${i}`)));
    const once = repaginatePanelLayout(layout, { gridCols: 4, pageRows: 8 });
    expect(repaginatePanelLayout(once, { gridCols: 4, pageRows: 8 })).toBe(once);
  });

  // Each config fills a 4x8 portrait page exactly (32 cells = 8x4 landscape).
  // The success criterion is purely "nothing clips" in either direction:
  // every widget stays in bounds and no two overlap.
  const FILLED_CONFIGS: Array<[string, Array<[PanelWidgetSize, number, number]>]> = [
    ['monitor + 2x2 pair + 4x4', [['4x2', 0, 0], ['2x2', 0, 2], ['2x2', 2, 2], ['4x4', 0, 4]]],
    ['four 4x2 stacked', [['4x2', 0, 0], ['4x2', 0, 2], ['4x2', 0, 4], ['4x2', 0, 6]]],
    ['four 2x4 columns', [['2x4', 0, 0], ['2x4', 2, 0], ['2x4', 0, 4], ['2x4', 2, 4]]],
    ['two 4x4', [['4x4', 0, 0], ['4x4', 0, 4]]],
    ['4x4 + four 2x2', [['4x4', 0, 0], ['2x2', 0, 4], ['2x2', 2, 4], ['2x2', 0, 6], ['2x2', 2, 6]]],
    ['two 2x4 + 4x4', [['2x4', 0, 0], ['2x4', 2, 0], ['4x4', 0, 4]]],
    ['2x2 pair + 4x2 + 4x4', [['2x2', 0, 0], ['2x2', 2, 0], ['4x2', 0, 2], ['4x4', 0, 4]]],
    ['eight 2x2 grid', [['2x2', 0, 0], ['2x2', 2, 0], ['2x2', 0, 2], ['2x2', 2, 2],
      ['2x2', 0, 4], ['2x2', 2, 4], ['2x2', 0, 6], ['2x2', 2, 6]]],
  ];

  it.each(FILLED_CONFIGS)('does not clip rotating a filled page both ways: %s', (_name, cells) => {
    const portrait = layoutWith(cells.map(([size, col, row], i) => widget(size, col, row, `w${i}`)));
    // portrait -> landscape
    const landscape = repaginatePanelLayout(portrait, { gridCols: 8, pageRows: 4 });
    assertNoClip(landscape.pages[0].widgets, 8, 4);
    // landscape -> portrait
    const backToPortrait = repaginatePanelLayout(landscape, { gridCols: 4, pageRows: 8 });
    assertNoClip(backToPortrait.pages[0].widgets, 4, 8);
  });

  // Y70 rotation (NEX-67): the 4x16 portrait grid transposes to 16x4 in
  // landscape (grid.ts y70Landscape), so both orientations hold 64 cells and
  // any portrait page must survive rotating both ways without clip or overlap.
  it('packs the NEX-67 five-widget Y70 stack into landscape (no overlap)', () => {
    const stack = [
      widget('4x2', 0, 0, 'clock'),
      widget('4x2', 0, 2, 'mon'),
      widget('4x2', 0, 4, 'light'),
      widget('4x2', 0, 6, 'cool'),
      widget('4x2', 0, 8, 'media'),
    ];
    const next = repaginatePanelLayout(layoutWith(stack), { gridCols: 16, pageRows: 4 });
    const byId = Object.fromEntries(next.pages[0].widgets.map(w => [w.id, w]));
    expect(byId.clock).toMatchObject({ col: 0, row: 0 });
    expect(byId.mon).toMatchObject({ col: 0, row: 2 });
    expect(byId.light).toMatchObject({ col: 4, row: 0 });
    expect(byId.cool).toMatchObject({ col: 4, row: 2 });
    expect(byId.media).toMatchObject({ col: 8, row: 0 });
    assertNoClip(next.pages[0].widgets, 16, 4);
  });

  // Each config fills a 4x16 portrait Y70 page exactly (64 cells).
  const Y70_FILLED_CONFIGS: Array<[string, Array<[PanelWidgetSize, number, number]>]> = [
    ['eight 4x2 stacked', [['4x2', 0, 0], ['4x2', 0, 2], ['4x2', 0, 4], ['4x2', 0, 6],
      ['4x2', 0, 8], ['4x2', 0, 10], ['4x2', 0, 12], ['4x2', 0, 14]]],
    ['four 4x4 stacked', [['4x4', 0, 0], ['4x4', 0, 4], ['4x4', 0, 8], ['4x4', 0, 12]]],
    ['mixed sizes', [['4x2', 0, 0], ['2x2', 0, 2], ['2x2', 2, 2], ['4x4', 0, 4],
      ['2x4', 0, 8], ['2x4', 2, 8], ['4x2', 0, 12], ['2x2', 0, 14], ['2x2', 2, 14]]],
    ['sixteen 2x2 grid', Array.from({ length: 16 }, (_, i): [PanelWidgetSize, number, number] =>
      ['2x2', (i % 2) * 2, Math.floor(i / 2) * 2])],
  ];

  it.each(Y70_FILLED_CONFIGS)('does not clip rotating a filled Y70 page both ways: %s', (_name, cells) => {
    const portrait = layoutWith(cells.map(([size, col, row], i) => widget(size, col, row, `w${i}`)));
    // portrait -> landscape
    const landscape = repaginatePanelLayout(portrait, { gridCols: 16, pageRows: 4 });
    expect(landscape.pages).toHaveLength(1);
    expect(landscape.pages[0].widgets).toHaveLength(cells.length);
    assertNoClip(landscape.pages[0].widgets, 16, 4);
    // landscape -> portrait
    const backToPortrait = repaginatePanelLayout(landscape, { gridCols: 4, pageRows: 16 });
    expect(backToPortrait.pages).toHaveLength(1);
    expect(backToPortrait.pages[0].widgets).toHaveLength(cells.length);
    assertNoClip(backToPortrait.pages[0].widgets, 4, 16);
  });
});
