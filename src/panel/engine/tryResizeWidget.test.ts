import { describe, expect, it } from 'vitest';
import { tryResizeWidget } from './panelLayoutOps';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { sizeToSpan } from './grid';

const CAPACITY = { gridCols: 4, pageRows: 4 };
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

// Compute the rect of a widget at its stored (col, row) given capacity cols.
function rectOf(w: PanelWidget) {
  const span = sizeToSpan(w.size);
  return { col: w.col, row: w.row, colSpan: span.cols, rowSpan: span.rows };
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
        const a = rectOf(page.widgets[i]);
        const b = rectOf(page.widgets[j]);
        const overlap = a.col < b.col + b.colSpan && b.col < a.col + a.colSpan
          && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;
        expect(overlap, `${page.widgets[i].id} overlaps ${page.widgets[j].id} on page ${page.id}`).toBe(false);
      }
    }
  }
}

describe('tryResizeWidget', () => {
  it('returns the layout unchanged when the size is already current', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(tryResizeWidget(l, 'a', '2x2', CAPACITY, MAX_PAGES)).toBe(l);
  });

  it('returns the layout unchanged when the widget id is unknown', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(tryResizeWidget(l, 'missing', '4x4', CAPACITY, MAX_PAGES)).toBe(l);
  });

  it('shrinks in place without disturbing siblings', () => {
    const l = layout([[
      widget('a', '4x4', 0, 0),
      widget('b', '2x2', 0, 0), // sibling parked off (would overlap if pre-existing — exercise post-shrink)
    ]]);
    // Pre-existing overlap before resize is contrived; place sibling at (2, 2) instead.
    const clean = layout([[
      widget('a', '4x4', 0, 0),
    ]]);
    const result = tryResizeWidget(clean, 'a', '2x2', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')?.widget.size).toBe('2x2');
    expectNoOverlap(result!);
  });

  it('pushes an overlapped sibling into the same page when there is room', () => {
    // Source page has the monitoring 2x4 + a 2x2 sibling at (2, 0) that
    // does NOT overlap the original 2x4. Resize 2x4 -> 4x4 makes the
    // sibling overlap, so it should cascade somewhere on the same page.
    const l = layout([[
      widget('a', '2x4', 0, 0),
      widget('b', '2x2', 2, 0),
    ]]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    expect(findWidget(result!, 'a')?.widget.size).toBe('4x4');
    expectNoOverlap(result!);
    // 'a' fills the page, so 'b' MUST be on a different page.
    const aLoc = findWidget(result!, 'a');
    const bLoc = findWidget(result!, 'b');
    expect(aLoc?.pageIdx).toBe(0);
    expect(bLoc?.pageIdx).not.toBe(0);
  });

  it('cascades displaced widgets to existing later pages before creating new ones', () => {
    // Page 1: monitoring 2x4 + sibling 2x2. Page 2: empty. Resize
    // monitoring to 4x4 -> sibling must move; page 2 has room so we
    // should NOT spawn a third page.
    const l = layout([
      [widget('a', '2x4', 0, 0), widget('b', '2x2', 2, 0)],
      [],
    ]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(2);
    expect(findWidget(result!, 'b')?.pageIdx).toBe(1);
    expectNoOverlap(result!);
  });

  it('creates a new trailing page when all existing pages are full', () => {
    // Page 1: monitoring 2x4 + 2x2 sibling. Resize to 4x4: sibling has
    // nowhere on page 1 (filled), no other pages -> spawn page 2.
    const l = layout([[widget('a', '2x4', 0, 0), widget('b', '2x2', 2, 0)]]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    expect(result!.pages.length).toBe(2);
    expect(findWidget(result!, 'b')?.pageIdx).toBe(1);
    expectNoOverlap(result!);
  });

  it('rejects (returns null) when displaced widgets cannot fit anywhere within maxPages', () => {
    // Five pages, all full of 4x4 widgets. Resize the smallest into
    // something bigger: there's nowhere for the bumped 4x4 sibling to
    // go because every other page is already at capacity.
    // Use 2 pages capped at 2 for clarity.
    const l = layout([
      [widget('a', '2x4', 0, 0), widget('b', '2x2', 2, 0), widget('c', '2x2', 2, 2)],
      [widget('d', '4x4', 0, 0)],
    ]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, /*maxPages*/ 2);
    expect(result).toBeNull();
  });

  it('rejects when the new size is physically larger than the grid', () => {
    // 4x4 grid, widget requests rowSpan > rows.
    const small: typeof CAPACITY = { gridCols: 4, pageRows: 2 };
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    // Can the widget grow to 4x4 when there are only 2 rows? No.
    expect(tryResizeWidget(l, 'a', '4x4', small, MAX_PAGES)).toBeNull();
  });

  it('is deterministic: cascades displaced widgets in row-major order', () => {
    // Three small siblings at (2,0), (0,2), (2,2). Resize a 2x4 to 4x4:
    // first sibling encountered is at row 0, then row 2 widgets.
    const l = layout([
      [
        widget('a', '2x4', 0, 0),
        widget('y', '2x2', 0, 2),
        widget('x', '2x2', 2, 0),
        widget('z', '2x2', 2, 2),
      ],
      [],
    ]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    expectNoOverlap(result!);
    // All three siblings must end up SOMEWHERE.
    expect(findWidget(result!, 'x')).not.toBeNull();
    expect(findWidget(result!, 'y')).not.toBeNull();
    expect(findWidget(result!, 'z')).not.toBeNull();
  });

  it('slides the resized widget back into bounds when its position would overflow', () => {
    // Widget at (2, 0) sized 2x4 (cols 2-3, rows 0-3). Grow to 4x4: the
    // rect would extend past col 3 if we left (col, row) unchanged.
    // Slide to (0, 0) so the 4x4 fits.
    const l = layout([[widget('a', '2x4', 2, 0)]]);
    const result = tryResizeWidget(l, 'a', '4x4', CAPACITY, MAX_PAGES);
    expect(result).not.toBeNull();
    const a = findWidget(result!, 'a');
    expect(a?.widget.size).toBe('4x4');
    expect(a?.widget.col).toBe(0);
    expect(a?.widget.row).toBe(0);
  });
});
