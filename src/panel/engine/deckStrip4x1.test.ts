// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  appendWidget, canAppendWidget, previewDrag, tryResizeWidget,
} from './panelLayoutOps';
import {
  fitLayoutToPages, fitLayoutToSinglePage, firstFreeRect, overflowLayout, pageHasOverlap,
  repackToFit, repaginatePanelLayout, restoreOverflowPositions,
} from './paginate';
import { sizeToSpan } from './grid';
import { normalizePanelLayout } from './usePanelLayout';
import { innerGridForSize } from '../widgets/deck/deckLayout';
import { APP_REGISTRY, pickerSizeFor, sizesForSurface } from '../widgets/registry';
import { SIZE_ICONS } from '../widgets/common/SizeIcons';
import { normalizePanelWidgetSize, PANEL_WIDGET_SIZES } from '../types';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

vi.mock('../../widgets/api', () => ({ listInstalledApps: vi.fn() }));

function widget(id: string, size: PanelWidgetSize, col: number, row: number, type = 'deck'): PanelWidget {
  return { id, type, size, col, row };
}

function layoutOf(...pages: PanelWidget[][]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'desktop',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
  };
}

const rects = (widgets: readonly PanelWidget[]) => widgets.map(w => {
  const span = sizeToSpan(w.size);
  return { id: w.id, col: w.col, row: w.row, colSpan: span.cols, rowSpan: span.rows };
});

function expectClean(widgets: readonly PanelWidget[], cols: number, rows?: number) {
  expect(pageHasOverlap(widgets, cols)).toBe(false);
  for (const r of rects(widgets)) {
    expect(r.col, `${r.id} col`).toBeGreaterThanOrEqual(0);
    expect(r.row, `${r.id} row`).toBeGreaterThanOrEqual(0);
    if (rows !== undefined) expect(r.row + r.rowSpan, `${r.id} bottom`).toBeLessThanOrEqual(rows);
  }
}

const at = (l: PanelLayout, id: string) => {
  for (const p of l.pages) {
    const w = p.widgets.find(x => x.id === id);
    if (w) return [w.col, w.row, w.size];
  }
  return undefined;
};

describe('4x1 span and snap', () => {
  it('is 4 columns wide and 1 row tall', () => {
    expect(sizeToSpan('4x1')).toEqual({ cols: 4, rows: 1 });
  });

  it('survives normalizePanelWidgetSize', () => {
    expect(PANEL_WIDGET_SIZES).toContain('4x1');
    expect(normalizePanelWidgetSize('4x1')).toBe('4x1');
  });

  it('has a size icon and a deck inner grid of one row of four keys', () => {
    expect(SIZE_ICONS['4x1']).toBeTypeOf('function');
    expect(innerGridForSize('4x1')).toEqual({ cols: 4, rows: 1, count: 4 });
  });
});

describe('4x1 placement among coarser widgets', () => {
  it('stacks strips on consecutive rows', () => {
    const existing = [widget('a', '4x1', 0, 0)];
    expect(firstFreeRect(existing, 4, 8, 4, 1)).toEqual({ col: 0, row: 1 });
  });

  it('lands below a 2x2 pair rather than inside it', () => {
    const existing = [widget('a', '2x2', 0, 0, 'clock'), widget('b', '2x2', 2, 0, 'clock')];
    expect(firstFreeRect(existing, 4, 8, 4, 1)).toEqual({ col: 0, row: 2 });
  });

  it('puts the next 2x2 in the first free cell right under the strip', () => {
    const existing = [widget('a', '4x1', 0, 0)];
    expect(firstFreeRect(existing, 4, 8, 2, 2)).toEqual({ col: 0, row: 1 });
  });

  it('a 2x2 takes the only odd-row hole when nothing else is free', () => {
    const existing = [widget('a', '4x1', 0, 0), widget('b', '4x1', 0, 3)];
    expect(firstFreeRect(existing, 4, 4, 2, 2)).toEqual({ col: 0, row: 1 });
  });

  it('appends several strips mixed with other sizes without overlap', () => {
    const capacity = { gridCols: 4, pageRows: 16 };
    let layout = layoutOf([]);
    const adds: [string, PanelWidgetSize, string][] = [
      ['d1', '4x1', 'deck'], ['c1', '2x2', 'clock'], ['d2', '4x1', 'deck'],
      ['m1', '4x2', 'media'], ['d3', '4x1', 'deck'], ['d4', '4x1', 'deck'], ['s1', '4x4', 'stocks'],
    ];
    for (const [id, size, type] of adds) layout = appendWidget(layout, widget(id, size, 0, 0, type), capacity);
    expect(layout.pages).toHaveLength(1);
    expectClean(layout.pages[0].widgets, 4, 16);
  });

  it('spills a strip to a new page when a short page is full, and refuses on a single page', () => {
    const capacity = { gridCols: 4, pageRows: 2 };
    const full = layoutOf([widget('a', '4x1', 0, 0), widget('b', '4x1', 0, 1)]);
    const spilled = appendWidget(full, widget('c', '4x1', 0, 0), capacity);
    expect(spilled.pages).toHaveLength(2);
    expect(canAppendWidget(full, '4x1', capacity, { singlePage: true })).toBe(false);
    expect(canAppendWidget(full, '4x1', capacity)).toBe(true);
  });
});

describe('4x1 drag', () => {
  const capacity = { gridCols: 4, pageRows: 8 };

  it('drops on an odd row and leaves the coarse neighbours put', () => {
    const l = layoutOf([widget('d', '4x1', 0, 0), widget('c', '2x2', 0, 2, 'clock')]);
    const next = previewDrag(l, 'd', 'p1', 0, 1, capacity)!;
    expect(at(next, 'd')).toEqual([0, 1, '4x1']);
    expect(at(next, 'c')).toEqual([0, 2, '2x2']);
  });

  it('moves an overlapped 2x2 the least distance, below the strip', () => {
    const l = layoutOf([widget('d', '4x1', 0, 7), widget('c', '2x2', 0, 2, 'clock')]);
    const next = previewDrag(l, 'd', 'p1', 0, 2, capacity)!;
    expect(next).not.toBeNull();
    expectClean(next.pages[0].widgets, 4, 8);
    expect(at(next, 'd')).toEqual([0, 2, '4x1']);
    expect(at(next, 'c')).toEqual([0, 3, '2x2']);
  });

  it('moves a strip within a page of several strips with no overlap', () => {
    const l = layoutOf([
      widget('a', '4x1', 0, 0), widget('b', '4x1', 0, 1), widget('c', '4x1', 0, 2), widget('d', '4x1', 0, 3),
    ]);
    const next = previewDrag(l, 'd', 'p1', 0, 0, capacity)!;
    expectClean(next.pages[0].widgets, 4, 8);
    expect(at(next, 'd')).toEqual([0, 0, '4x1']);
  });

  it('refuses a drop that leaves the grid', () => {
    const l = layoutOf([widget('d', '4x1', 0, 0)]);
    expect(previewDrag(l, 'd', 'p1', 0, 8, capacity)).toBeNull();
    expect(previewDrag(l, 'd', 'p1', 2, 0, capacity)).toBeNull();
  });
});

describe('resize between deck sizes', () => {
  const capacity = { gridCols: 4, pageRows: 8 };

  it('shrinks 4x2 to 4x1 in place', () => {
    const l = layoutOf([widget('d', '4x2', 0, 2)]);
    expect(at(tryResizeWidget(l, 'd', '4x1', capacity, 5)!, 'd')).toEqual([0, 2, '4x1']);
  });

  it('grows a strip on an odd row in place', () => {
    const l = layoutOf([widget('a', '4x1', 0, 0), widget('d', '4x1', 0, 1)]);
    const next = tryResizeWidget(l, 'd', '4x2', capacity, 5)!;
    expectClean(next.pages[0].widgets, 4, 8);
    expect(at(next, 'd')).toEqual([0, 1, '4x2']);
  });

  it('grows 4x1 to 4x4 and 2x2 through the neighbours without overlap', () => {
    const l = layoutOf([
      widget('d', '4x1', 0, 1), widget('c', '2x2', 0, 2, 'clock'), widget('e', '2x2', 2, 2, 'clock'),
    ]);
    for (const size of ['2x2', '4x2', '4x4'] as const) {
      const next = tryResizeWidget(l, 'd', size, capacity, 5)!;
      expect(next).not.toBeNull();
      const all = next.pages.flatMap(p => p.widgets);
      expect(all).toHaveLength(3);
      for (const p of next.pages) expectClean(p.widgets, 4, 8);
    }
  });

  it('does not touch the position of other widgets that resize', () => {
    const l = layoutOf([widget('c', '2x2', 1, 1, 'clock')]);
    expect(at(tryResizeWidget(l, 'c', '4x2', { gridCols: 4, pageRows: 8 }, 5)!, 'c')).toEqual([0, 1, '4x2']);
    const own = layoutOf([widget('c', '4x2', 0, 3, 'clock')]);
    expect(at(tryResizeWidget(own, 'c', '2x2', capacity, 5)!, 'c')).toEqual([0, 3, '2x2']);
  });

  it('round-trips 2x2 to 4x1 to 4x2 to 4x4 to 4x1', () => {
    let l = layoutOf([widget('d', '2x2', 2, 2)]);
    for (const size of ['4x1', '4x2', '4x4', '4x1'] as const) {
      l = tryResizeWidget(l, 'd', size, capacity, 5)!;
      expect(l).not.toBeNull();
      expect((at(l, 'd') as unknown[])[2]).toBe(size);
      expectClean(l.pages[0].widgets, 4, 8);
    }
  });
});

describe('auto-arrange, window fit and repack with 4x1', () => {
  it('overflowLayout moves a clipped strip below, from the left, without overlap', () => {
    const l = layoutOf([
      widget('a', '2x4', 0, 0, 'clock'), widget('d1', '4x1', 2, 0), widget('d2', '4x1', 2, 1), widget('d3', '4x1', 8, 0),
    ]);
    const shown = overflowLayout(l, 6);
    expectClean(shown.pages[0].widgets, 6);
    const byId = Object.fromEntries(shown.pages[0].widgets.map(w => [w.id, [w.col, w.row]]));
    expect(byId.a).toEqual([0, 0]);
    expect(byId.d1).toEqual([2, 0]);
    expect(byId.d2).toEqual([2, 1]);
    expect(byId.d3).toEqual([0, 4]);
  });

  it('overflowLayout at the narrowest window (4 columns) stacks every offscreen strip', () => {
    const l = layoutOf([
      widget('d1', '4x1', 0, 0), widget('d2', '4x1', 4, 0), widget('d3', '4x1', 8, 0), widget('c', '2x2', 12, 0, 'clock'),
    ]);
    const shown = overflowLayout(l, 4);
    expectClean(shown.pages[0].widgets, 4);
    for (const w of shown.pages[0].widgets) expect(w.col + sizeToSpan(w.size).cols).toBeLessThanOrEqual(4);
  });

  it('restoreOverflowPositions returns an untouched displaced strip to its stored cell', () => {
    const stored = layoutOf([widget('a', '4x4', 0, 0, 'clock'), widget('d', '4x1', 8, 0)]);
    const shown = overflowLayout(stored, 6);
    expect(restoreOverflowPositions(shown, stored, shown).pages[0].widgets.find(w => w.id === 'd')).toMatchObject({ col: 8, row: 0 });
  });

  it('repackToFit closes the odd-row gaps and keeps every size on the page', () => {
    const widgets = [
      widget('a', '4x1', 0, 0), widget('b', '2x2', 0, 3, 'clock'), widget('c', '2x2', 2, 3, 'clock'), widget('d', '4x1', 0, 5),
    ];
    const packed = repackToFit(widgets, 4, 8, false);
    expectClean(packed, 4, 8);
    expect(packed.map(w => w.size)).toEqual(widgets.map(w => w.size));
    expect(packed.find(w => w.id === 'a')).toMatchObject({ col: 0, row: 0 });
    expect(packed.find(w => w.id === 'd')).toMatchObject({ col: 0, row: 3 });
  });

  it('repaginatePanelLayout clamps a strip into a shorter grid and repacks overlap', () => {
    const l = layoutOf([widget('a', '4x1', 0, 6), widget('b', '4x1', 0, 7), widget('c', '4x1', 0, 9)]);
    const next = repaginatePanelLayout(l, { gridCols: 4, pageRows: 4 });
    expectClean(next.pages[0].widgets, 4, 4);
  });

  it('repaginatePanelLayout keeps a clean strip layout by reference', () => {
    const l = layoutOf([widget('a', '4x1', 0, 0), widget('b', '4x1', 0, 3)]);
    expect(repaginatePanelLayout(l, { gridCols: 4, pageRows: 8 })).toBe(l);
  });

  it('repaginatePanelLayout repacks a transposed (landscape 8x4) grid without overlap', () => {
    const l = layoutOf([
      widget('a', '4x1', 0, 0), widget('b', '4x1', 0, 1), widget('c', '2x2', 0, 2, 'clock'), widget('d', '4x1', 0, 4),
    ]);
    const next = repaginatePanelLayout(l, { gridCols: 8, pageRows: 4 });
    expectClean(next.pages[0].widgets, 8, 4);
  });

  it('fitLayoutToPages paginates strips into pages of a short grid', () => {
    const l = layoutOf([0, 1, 2, 3, 4].map(i => widget(`d${i}`, '4x1', 0, i)));
    const { layout, dropped } = fitLayoutToPages(l, { gridCols: 4, pageRows: 2 }, 10);
    expect(dropped).toEqual([]);
    expect(layout.pages.map(p => p.widgets.length)).toEqual([2, 2, 1]);
    for (const p of layout.pages) expectClean(p.widgets, 4, 2);
  });

  it('fitLayoutToSinglePage keeps strips and drops only what does not fit', () => {
    const l = layoutOf([0, 1, 2].map(i => widget(`d${i}`, '4x1', 0, i)));
    const { layout, dropped } = fitLayoutToSinglePage(l, { gridCols: 4, pageRows: 2 });
    expect(layout.pages[0].widgets).toHaveLength(2);
    expect(dropped.map(w => w.id)).toEqual(['d2']);
  });

  it('a strip is never stranded wider than a narrower grid', () => {
    const l = layoutOf([widget('d', '4x1', 0, 0)]);
    expect(repaginatePanelLayout(l, { gridCols: 2, pageRows: 8 }).pages[0].widgets[0].col).toBe(0);
  });
});

describe('4x1 offered only by deck', () => {
  it('lists 4x1 for no widget but deck', () => {
    const offering = Object.entries(APP_REGISTRY)
      .filter(([, def]) => def.meta.sizes.includes('4x1'))
      .map(([type]) => type);
    expect(offering).toEqual(['deck']);
  });

  it('offers deck the strip on every multi-widget surface and never on single-widget displays', () => {
    const deck = APP_REGISTRY.deck.meta;
    for (const surface of ['desktop', 'y70', 'phone'] as const) {
      expect(sizesForSurface(deck, surface), surface).toContain('4x1');
    }
    expect(sizesForSurface(deck, 'monitor', true)).toContain('4x1');
    for (const surface of ['q60', 'lcd-round', 'lcd-square', 'lcd-wide'] as const) {
      expect(sizesForSurface(deck, surface), surface).not.toContain('4x1');
    }
    expect(sizesForSurface(deck, 'monitor')).toEqual([]);
  });

  it('keeps the strip out of a grid narrower than four columns and keeps the default size', () => {
    const deck = APP_REGISTRY.deck.meta;
    expect(sizesForSurface(deck, 'phone', undefined, { slots: 2, landscape: false })).not.toContain('4x1');
    expect(sizesForSurface(deck, 'phone', undefined, { slots: 4, landscape: false })).toContain('4x1');
    // Landscape: the short axis is rows, and a strip is one row tall.
    expect(sizesForSurface(deck, 'phone', undefined, { slots: 2, landscape: true })).toContain('4x1');
    expect(deck.defaultSize).toBe('4x2');
    expect(pickerSizeFor(deck, 'desktop')).toBe('4x2');
  });

  it('does not change what any other widget offers', () => {
    for (const [type, def] of Object.entries(APP_REGISTRY)) {
      if (type === 'deck') continue;
      expect(sizesForSurface(def.meta, 'desktop'), type).not.toContain('4x1');
    }
  });
});

describe('persistence and reconcile', () => {
  it('keeps a stored deck strip and its position through a JSON round trip and normalize', () => {
    const l = layoutOf([widget('d', '4x1', 0, 3), widget('c', '2x2', 0, 4, 'clock')]);
    const reloaded = JSON.parse(JSON.stringify(l)) as PanelLayout;
    for (const surface of ['desktop', 'y70', 'phone'] as const) {
      const normalized = normalizePanelLayout({ ...reloaded, surface }, surface);
      expect(at(normalized, 'd')).toEqual([0, 3, '4x1']);
      expect(at(normalized, 'c')).toEqual([0, 4, '2x2']);
    }
  });

  it('snaps a strip stored on a widget that does not offer it to its nearest size', () => {
    const l = layoutOf([widget('c', '4x1', 0, 0, 'clock')]);
    const size = (at(normalizePanelLayout(l, 'desktop'), 'c') as unknown[])[2];
    expect(size).not.toBe('4x1');
    expect(['2x2', '4x2']).toContain(size);
  });

  it('snaps a strip to a 2x2, not a tall strip, on a grid with forced narrow columns', () => {
    const l = layoutOf([widget('d', '4x1', 0, 0)]);
    const next = normalizePanelLayout(l, 'phone', undefined, { slots: 2, landscape: false });
    expect((at(next, 'd') as unknown[])[2]).toBe('2x2');
  });
});
