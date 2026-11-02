// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SIMULATED_SCREEN_CATALOG } from '../../lib/simulatedScreenCatalog';
import { panelWidgetPaddingRatio, PANEL_WIDGET_PADDING_DEFAULT_PERCENT } from './grid';
import { firstFreeRect, pageFitsGrid, repaginatePanelLayout } from './paginate';
import { fitLayoutForWidgetSize, widgetSizeCapacity } from './widgetSizeFit';
import { MAX_PANEL_PAGES } from './panelGrid';
import { panelWidgetSizeOptions, widgetSizeShortSideSlots, type PanelLayout, type PanelWidget, type PanelWidgetSizeMode } from '../types';

// The Y70 touch simulator entry: native px at its real density, shown by Edge at the Windows scale of 150%.
const Y70 = SIMULATED_SCREEN_CATALOG.find(s => s.id === 'y70')!;
const DPR = 1.5;
const CANVAS = { width: Y70.width / DPR, height: Y70.height / DPR };
const PADDING = panelWidgetPaddingRatio(PANEL_WIDGET_PADDING_DEFAULT_PERCENT);
const OPTIONS = panelWidgetSizeOptions('y70')!;

function capacityOf(mode: PanelWidgetSizeMode) {
  return widgetSizeCapacity('y70', CANVAS, DPR, Y70.dpi, PADDING, widgetSizeShortSideSlots(OPTIONS, mode, undefined))!;
}

// Fills a page with 2x2 tiles in reading order, ids in that order.
function fullPage(cols: number, rows: number): PanelWidget[] {
  const out: PanelWidget[] = [];
  for (let row = 0; row + 2 <= rows; row += 2) {
    for (let col = 0; col + 2 <= cols; col += 2) out.push({ id: `w${out.length}`, type: 'clock', size: '2x2', col, row });
  }
  return out;
}

const layoutOf = (widgets: PanelWidget[]): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'y70', pages: [{ id: 'p1', widgets }] });

function expectClean(layout: PanelLayout, cols: number, rows: number) {
  for (const page of layout.pages) expect(pageFitsGrid(page.widgets, cols, rows), `page ${page.id}`).toBe(true);
}

describe('Y70 Widget scale 75% to 100%', () => {
  it('the 100% grid is narrower than the 75% grid', () => {
    expect(capacityOf('medium').gridCols).toBeGreaterThan(capacityOf('large').gridCols);
  });

  it('flows a full 75% layout onto page 2 with no overlap, keeping every widget and the reading order', () => {
    const small = capacityOf('medium');
    const large = capacityOf('large');
    const full = layoutOf(fullPage(small.gridCols, small.pageRows));
    const total = full.pages[0].widgets.length;
    const { layout, dropped } = fitLayoutForWidgetSize(full, large, 'pages', MAX_PANEL_PAGES);
    expect(dropped).toEqual([]);
    expect(layout.pages.length).toBeGreaterThan(1);
    expectClean(layout, large.gridCols, large.pageRows);
    const ids = layout.pages.flatMap(p => p.widgets.map(w => w.id));
    expect(ids.length).toBe(total);
    // Reading order: page by page, each page row-major, matches the 75% reading order.
    const pageOrder = layout.pages.flatMap(p => [...p.widgets].sort((a, b) => a.row - b.row || a.col - b.col).map(w => w.id));
    expect(pageOrder).toEqual(full.pages[0].widgets.map(w => w.id));
  });

  it('going back to 75% loses nothing and leaves the pages as they are', () => {
    const small = capacityOf('medium');
    const large = capacityOf('large');
    const full = layoutOf(fullPage(small.gridCols, small.pageRows));
    const down = fitLayoutForWidgetSize(full, large, 'pages', MAX_PANEL_PAGES).layout;
    const back = fitLayoutForWidgetSize(down, small, 'pages', MAX_PANEL_PAGES);
    expect(back.dropped).toEqual([]);
    expect(back.layout.pages.flatMap(p => p.widgets).length).toBe(full.pages[0].widgets.length);
    expectClean(back.layout, small.gridCols, small.pageRows);
  });
});

describe('render-time repagination never draws an overlap', () => {
  it('moves a 75% layout shown on the 100% grid onto following pages', () => {
    const small = capacityOf('medium');
    const large = capacityOf('large');
    const full = layoutOf(fullPage(small.gridCols, small.pageRows));
    const shown = repaginatePanelLayout(full, large);
    expect(shown.pages.length).toBeGreaterThan(1);
    expectClean(shown, large.gridCols, large.pageRows);
    expect(shown.pages.flatMap(p => p.widgets).length).toBe(full.pages[0].widgets.length);
    expect(repaginatePanelLayout(shown, large)).toBe(shown);
  });

  it('moves widgets saved past the last row onto a following page', () => {
    const widgets: PanelWidget[] = [
      { id: 'a', type: 'clock', size: '4x4', col: 0, row: 0 },
      { id: 'b', type: 'clock', size: '4x4', col: 0, row: 4 },
      { id: 'c', type: 'clock', size: '4x4', col: 0, row: 6 },
      { id: 'd', type: 'clock', size: '4x4', col: 0, row: 9 },
    ];
    const shown = repaginatePanelLayout(layoutOf(widgets), { gridCols: 4, pageRows: 8 });
    expectClean(shown, 4, 8);
    expect(shown.pages.flatMap(p => p.widgets).map(w => w.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a widget larger than the whole grid alone, clamped to its corner', () => {
    const widgets: PanelWidget[] = [
      { id: 'a', type: 'clock', size: '2x2', col: 0, row: 0 },
      { id: 'big', type: 'clock', size: '4x4', col: 0, row: 2 },
    ];
    const cap = { gridCols: 4, pageRows: 2 };
    const shown = repaginatePanelLayout(layoutOf(widgets), cap);
    expect(shown.pages.map(p => p.widgets.map(w => w.id))).toEqual([['a'], ['big']]);
    expect(repaginatePanelLayout(shown, cap)).toBe(shown);
  });

  it('settles for a tall narrow widget beside others, and keeps page ids unique', () => {
    const widgets: PanelWidget[] = [
      { id: 'a', type: 'clock', size: '2x4', col: 0, row: 0 },
      { id: 'b', type: 'clock', size: '2x2', col: 2, row: 0 },
    ];
    const cap = { gridCols: 6, pageRows: 2 };
    const shown = repaginatePanelLayout(layoutOf(widgets), cap);
    expect(shown.pages.flatMap(p => p.widgets).map(w => w.id).sort()).toEqual(['a', 'b']);
    expect(repaginatePanelLayout(shown, cap)).toBe(shown);

    const crowded: PanelLayout = {
      ...layoutOf([0, 1, 2].map(i => ({ id: `t${i}`, type: 'clock', size: '2x2' as const, col: 0, row: 0 }))),
    };
    crowded.pages.push({ id: 'p1-overflow-1', widgets: [] });
    const out = repaginatePanelLayout(crowded, { gridCols: 2, pageRows: 2 });
    const ids = out.pages.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the immersive-on-load widget first on page 1 when a scale change reflows', () => {
    const small = capacityOf('medium');
    const large = capacityOf('large');
    const widgets = fullPage(small.gridCols, small.pageRows);
    const last = widgets[widgets.length - 1].id;
    const { layout } = fitLayoutForWidgetSize({ ...layoutOf(widgets), immersiveOnLoadWidgetId: last }, large, 'pages', MAX_PANEL_PAGES);
    expect(layout.pages[0].widgets.some(w => w.id === last)).toBe(true);
  });
});

describe('Widget scale on a panel that renders one page', () => {
  const at100 = { gridCols: 28, pageRows: 12 };
  const at200 = { gridCols: 10, pageRows: 6 };
  const start = (): PanelLayout => {
    const widgets: PanelWidget[] = [];
    for (let i = 0; i < 40; i++) {
      const slot = firstFreeRect(widgets, at100.gridCols, at100.pageRows, 2, 2);
      if (!slot) throw new Error('fixture does not fit');
      widgets.push({ id: `w${i}`, type: 'clock', size: '2x2', col: slot.col, row: slot.row });
    }
    return { layoutSchemaVersion: 2, surface: 'monitor', activePageId: 'p0', pages: [{ id: 'p0', widgets }] };
  };

  it('keeps one page that fits and reports exactly the widgets without room as dropped', () => {
    const before = start();
    const { layout, dropped } = fitLayoutForWidgetSize(before, at200, 'single', MAX_PANEL_PAGES);
    expect(layout.pages).toHaveLength(1);
    expect(pageFitsGrid(layout.pages[0].widgets, at200.gridCols, at200.pageRows)).toBe(true);
    expect(dropped.length).toBeGreaterThan(0);
    const kept = layout.pages[0].widgets.map(w => w.id);
    expect([...kept, ...dropped.map(w => w.id)].sort()).toEqual(before.pages[0].widgets.map(w => w.id).sort());
  });

  it('drops nothing when every widget fits the new grid', () => {
    const few: PanelLayout = { ...start(), pages: [{ id: 'p0', widgets: start().pages[0].widgets.slice(0, 4) }] };
    const out = fitLayoutForWidgetSize(few, at200, 'single', MAX_PANEL_PAGES);
    expect(out.dropped).toEqual([]);
    expect(out.layout.pages).toHaveLength(1);
  });
});
