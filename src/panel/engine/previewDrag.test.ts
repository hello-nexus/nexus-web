import { describe, expect, it } from 'vitest';
import { previewDrag } from './panelLayoutOps';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { sizeToSpan } from './grid';

const CAPACITY = { gridCols: 4, pageRows: 4 };

function widget(id: string, size: PanelWidgetSize, col: number, row: number, type = 'cooling'): PanelWidget {
  return { id, type, size, col, row };
}

function layout(pages: PanelWidget[][]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
  };
}

function findWidget(result: PanelLayout, id: string): { pageIdx: number; widget: PanelWidget } | null {
  for (let i = 0; i < result.pages.length; i++) {
    const w = result.pages[i].widgets.find(w => w.id === id);
    if (w) return { pageIdx: i, widget: w };
  }
  return null;
}

function expectNoOverlap(result: PanelLayout) {
  for (const page of result.pages) {
    for (let i = 0; i < page.widgets.length; i++) {
      for (let j = i + 1; j < page.widgets.length; j++) {
        const a = page.widgets[i];
        const b = page.widgets[j];
        const sa = sizeToSpan(a.size);
        const sb = sizeToSpan(b.size);
        const overlap = a.col < b.col + sb.cols && b.col < a.col + sa.cols
          && a.row < b.row + sb.rows && b.row < a.row + sa.rows;
        expect(overlap, `${a.id} overlaps ${b.id} on page ${page.id}`).toBe(false);
      }
    }
  }
}

describe('previewDrag', () => {
  it('moves the widget to an empty cell on the same page', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)]]);
    const result = previewDrag(l, 'a', 'p1', 0, 2, CAPACITY);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')!.widget).toMatchObject({ col: 0, row: 2 });
    expect(findWidget(result!, 'b')!.widget).toMatchObject({ col: 2, row: 0 });
    expectNoOverlap(result!);
  });

  it('returns the same layout reference for a drop at the source cell', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)]]);
    expect(previewDrag(l, 'a', 'p1', 0, 0, CAPACITY)).toBe(l);
  });

  it('returns null for an unknown source or target page', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(previewDrag(l, 'missing', 'p1', 0, 2, CAPACITY)).toBeNull();
    expect(previewDrag(l, 'a', 'missing', 0, 2, CAPACITY)).toBeNull();
  });

  it('returns null when the rect would leave the grid', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(previewDrag(l, 'a', 'p1', 3, 0, CAPACITY)).toBeNull();
    expect(previewDrag(l, 'a', 'p1', 0, 3, CAPACITY)).toBeNull();
    expect(previewDrag(l, 'a', 'p1', -1, 0, CAPACITY)).toBeNull();
  });

  it('cascades an overlapped sibling into the first free slot', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 0, 2)]]);
    const result = previewDrag(l, 'a', 'p1', 0, 2, CAPACITY);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')!.widget).toMatchObject({ col: 0, row: 2 });
    // b is displaced into the first free stride-aligned slot (0, 0) - the
    // cell a vacated.
    expect(findWidget(result!, 'b')!.widget).toMatchObject({ col: 0, row: 0 });
    expectNoOverlap(result!);
  });

  it('cascades a displaced sibling into the cell the active widget vacated', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)]]);
    const result = previewDrag(l, 'a', 'p1', 2, 0, CAPACITY);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')!.widget).toMatchObject({ col: 2, row: 0 });
    expect(findWidget(result!, 'b')!.widget).toMatchObject({ col: 0, row: 0 });
    expectNoOverlap(result!);
  });

  it('homes a displaced widget into off-stride space when no aligned slot exists', () => {
    // 4x6 grid. Dropping a (2x2) onto d (4x2 full-width) blocks every
    // stride-aligned anchor for d: row 0 by the placed a, row 2 by k2,
    // row 4 by k1. Only the off-stride row 3 fits - without the stride-1
    // fallback this drop was refused despite the visible free band.
    const tall = { gridCols: 4, pageRows: 6 };
    const l = layout([[
      widget('d', '4x2', 0, 0),
      widget('a', '2x2', 0, 2),
      widget('k2', '1x1', 3, 2),
      widget('k1', '1x1', 1, 5),
    ]]);
    const result = previewDrag(l, 'a', 'p1', 0, 0, tall);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')!.widget).toMatchObject({ col: 0, row: 0 });
    expect(findWidget(result!, 'd')!.widget).toMatchObject({ col: 0, row: 3 });
    expectNoOverlap(result!);
  });

  it('refuses a 1x1 dropped onto a larger widget (iOS rule)', () => {
    const l = layout([[widget('a', '1x1', 0, 2), widget('b', '2x2', 0, 0)]]);
    expect(previewDrag(l, 'a', 'p1', 0, 0, CAPACITY)).toBeNull();
  });

  it('lets a 1x1 displace another 1x1', () => {
    const l = layout([[widget('a', '1x1', 0, 1), widget('b', '1x1', 0, 0)]]);
    const result = previewDrag(l, 'a', 'p1', 0, 0, CAPACITY);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')!.widget).toMatchObject({ col: 0, row: 0 });
    expectNoOverlap(result!);
  });

  it('moves a widget across pages onto an empty cell', () => {
    const l = layout([
      [widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)],
      [widget('c', '2x2', 0, 0)],
    ]);
    const result = previewDrag(l, 'a', 'p2', 2, 2, CAPACITY);
    expect(result).not.toBeNull();
    const a = findWidget(result!, 'a')!;
    expect(a.pageIdx).toBe(1);
    expect(a.widget).toMatchObject({ col: 2, row: 2 });
    // Source page no longer holds a.
    expect(result!.pages[0].widgets.map(w => w.id)).toEqual(['b']);
    expectNoOverlap(result!);
  });

  it('cross-page drop displaces target-page widgets within that page', () => {
    const l = layout([
      [widget('a', '2x2', 0, 0)],
      [widget('c', '2x2', 0, 0), widget('d', '2x2', 2, 0)],
    ]);
    const result = previewDrag(l, 'a', 'p2', 0, 0, CAPACITY);
    expect(result).not.toBeNull();
    const a = findWidget(result!, 'a')!;
    expect(a.pageIdx).toBe(1);
    expect(a.widget).toMatchObject({ col: 0, row: 0 });
    const c = findWidget(result!, 'c')!;
    expect(c.pageIdx).toBe(1);
    expectNoOverlap(result!);
  });

  it('returns null when a displaced widget has no home on the target page', () => {
    // Target page p2 completely full of 4x4 - dropping a 2x2 onto it
    // displaces a 4x4 with nowhere to go.
    const l = layout([
      [widget('a', '2x2', 0, 0)],
      [widget('c', '4x4', 0, 0)],
    ]);
    expect(previewDrag(l, 'a', 'p2', 0, 0, CAPACITY)).toBeNull();
  });
});
