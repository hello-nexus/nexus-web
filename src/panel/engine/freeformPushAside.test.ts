// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tryResizeWidget } from './panelLayoutOps';
import { sizeToSpan } from './grid';
import { clampFreeformSize } from './freeformResize';
import { repaginatePanelLayout } from './paginate';
import { normalizePanelLayout } from './usePanelLayout';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

const CAPACITY = { gridCols: 8, pageRows: 8 };
const MAX_PAGES = 5;

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

function find(result: PanelLayout, id: string) {
  for (let i = 0; i < result.pages.length; i++) {
    const w = result.pages[i].widgets.find(w => w.id === id);
    if (w) return { pageIdx: i, widget: w };
  }
  throw new Error(`missing ${id}`);
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
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  }
}

describe('tryResizeWidget with an explicit origin (freeform)', () => {
  it('resizes at the given origin instead of sliding in place', () => {
    const l = layout([[widget('a', '4x4', 4, 4)]]);
    const next = tryResizeWidget(l, 'a', '6x6', CAPACITY, MAX_PAGES, { col: 2, row: 2 })!;
    expect(find(next, 'a').widget).toMatchObject({ size: '6x6', col: 2, row: 2 });
  });

  it('moves a widget without changing its size', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    const next = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES, { col: 3, row: 1 })!;
    expect(find(next, 'a').widget).toMatchObject({ size: '4x4', col: 3, row: 1 });
  });

  it('is a no-op when neither size nor origin changes', () => {
    const l = layout([[widget('a', '4x4', 1, 1)]]);
    expect(tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES, { col: 1, row: 1 })).toBe(l);
  });

  it('pushes overlapped siblings aside on the same page when there is room', () => {
    const l = layout([[widget('a', '4x4', 0, 0), widget('b', '2x2', 4, 0)]]);
    const next = tryResizeWidget(l, 'a', '6x4', CAPACITY, MAX_PAGES, { col: 0, row: 0 })!;
    expect(find(next, 'a').widget).toMatchObject({ size: '6x4', col: 0, row: 0 });
    const b = find(next, 'b');
    expect(b.pageIdx).toBe(0);
    expect(b.widget.row >= 4 || b.widget.col >= 6).toBe(true);
    expectNoOverlap(next);
  });

  it('spills a pushed widget onto the next page when the page is full', () => {
    const l = layout([[widget('a', '4x4', 0, 0), widget('b', '4x4', 4, 0), widget('c', '4x4', 0, 4), widget('d', '4x4', 4, 4)]]);
    const next = tryResizeWidget(l, 'a', '4x8', CAPACITY, MAX_PAGES, { col: 0, row: 0 })!;
    expect(find(next, 'a').pageIdx).toBe(0);
    expect(find(next, 'c').pageIdx).toBe(1);
    expectNoOverlap(next);
  });

  it('rejects a span taller than the page', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    expect(tryResizeWidget(l, 'a', '4x10', CAPACITY, MAX_PAGES, { col: 0, row: 0 })).toBeNull();
  });

  it('rejects when pushed widgets have nowhere to go on a one page panel', () => {
    const l = layout([[widget('a', '4x4', 0, 0), widget('b', '4x4', 4, 0), widget('c', '4x4', 0, 4), widget('d', '4x4', 4, 4)]]);
    expect(tryResizeWidget(l, 'a', '4x8', CAPACITY, 1, { col: 0, row: 0 })).toBeNull();
  });

  it('clamps an origin that would leave the grid', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    const next = tryResizeWidget(l, 'a', '6x4', CAPACITY, MAX_PAGES, { col: 7, row: 0 })!;
    expect(find(next, 'a').widget).toMatchObject({ col: 2 });
  });
});

describe('freeform sizes in a stored layout', () => {
  it('survive normalize for a widget that opts in', () => {
    const l = layout([[widget('w', '6x4', 0, 0, 'web-view')]]);
    expect(normalizePanelLayout(l, 'y70').pages[0].widgets[0].size).toBe('6x4');
  });

  it('snap to a declared size for a widget that does not', () => {
    const l = layout([[widget('w', '6x4', 0, 0, 'cooling')]]);
    const size = normalizePanelLayout(l, 'y70').pages[0].widgets[0].size;
    expect(size).not.toBe('6x4');
    expect(['2x2', '4x2', '4x4']).toContain(size);
  });

  it('keep their stored size on a smaller grid, render clamped, and render in full again when capacity returns', () => {
    const l = layout([[widget('w', '8x4', 0, 0, 'web-view')]]);
    const narrow = repaginatePanelLayout(l, { gridCols: 4, pageRows: 8 });
    expect(narrow.pages[0].widgets[0]).toMatchObject({ size: '8x4', col: 0 });
    expect(clampFreeformSize(narrow.pages[0].widgets[0].size, { cols: 4, rows: 8 })).toBe('4x4');
    const wide = repaginatePanelLayout(narrow, { gridCols: 8, pageRows: 8 });
    expect(wide.pages[0].widgets[0].size).toBe('8x4');
    expect(clampFreeformSize(wide.pages[0].widgets[0].size, { cols: 8, rows: 8 })).toBe('8x4');
  });

  it('are left alone when the grid holds them', () => {
    const l = layout([[widget('w', '6x4', 2, 0, 'web-view')]]);
    expect(repaginatePanelLayout(l, { gridCols: 8, pageRows: 8 })).toBe(l);
  });
});
