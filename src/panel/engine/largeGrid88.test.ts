// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { panelGridCapacityForCanvas } from './grid';
import { fitLayoutToSinglePage } from './paginate';
import { normalizePanelLayout } from './usePanelLayout';
import { appAvailableForSurface, lookupApp, pickerSizeFor, sizesForSurface } from '../widgets/registry';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

const SLOTS = 2;
const DPI = 225;

function meta(type: string) {
  const def = lookupApp(type);
  if (!def) throw new Error(`missing widget ${type}`);
  return def.meta;
}

function widget(id: string, type: string, size: PanelWidgetSize, col = 0, row = 0): PanelWidget {
  return { id, type, size, col, row };
}

function layout(widgets: PanelWidget[]): PanelLayout {
  return { layoutSchemaVersion: 2, surface: 'monitor', pages: [{ id: 'p1', widgets }] };
}

describe('short-axis slot override on the 8.8 canvas', () => {
  const portrait = (shortSideSlots?: number) =>
    panelGridCapacityForCanvas(480, 1920, { surface: 'monitor', dpi: DPI, shortSideSlots });
  const landscape = (shortSideSlots?: number) =>
    panelGridCapacityForCanvas(1920, 480, { surface: 'monitor', dpi: DPI, shortSideSlots });

  it('keeps the density-derived grid without the override', () => {
    expect(portrait()).toMatchObject({ columns: 4, rows: 16 });
    expect(landscape()).toMatchObject({ columns: 16, rows: 4 });
  });

  it('halves the slots in portrait and doubles the cell', () => {
    const small = portrait();
    const large = portrait(SLOTS);
    expect(large).toMatchObject({ columns: 2, rows: 8 });
    expect(large.cellSize).toBeGreaterThan(small.cellSize * 1.9);
  });

  it('halves the slots in landscape too', () => {
    expect(landscape(SLOTS)).toMatchObject({ columns: 8, rows: 2 });
  });
});

describe('sizes offered on a reduced-width grid', () => {
  it('offers only sizes that fit and allows the 2x4 strip', () => {
    expect(sizesForSurface(meta('stocks'), 'monitor', false, SLOTS)).toEqual(['2x2', '2x4']);
  });

  it('keeps the usual 4-wide sizes without the override', () => {
    expect(sizesForSurface(meta('stocks'), 'monitor', false)).toEqual(['2x2', '4x2', '4x4']);
  });

  it('never offers the round tile or a size the widget lacks', () => {
    expect(sizesForSurface(meta('clock'), 'monitor', false, SLOTS)).toEqual(['2x2', '2x4']);
    const twoByTwoOnly = { ...meta('clock'), sizes: ['2x2' as const, '4x2' as const] };
    expect(sizesForSurface(twoByTwoOnly, 'monitor', false, SLOTS)).toEqual(['2x2']);
  });

  it('hides a widget with no size that fits', () => {
    expect(appAvailableForSurface(meta('processes'), 'monitor', { shortSideSlots: SLOTS })).toBe(false);
    expect(appAvailableForSurface(meta('processes'), 'monitor', {})).toBe(true);
  });

  it('picks a size from the narrow list', () => {
    expect(pickerSizeFor(meta('stocks'), 'monitor', false, SLOTS)).toBe('2x2');
  });
});

describe('normalizePanelLayout on a reduced-width grid', () => {
  it('snaps 4-wide widgets to 2x2 and keeps 2x4', () => {
    const result = normalizePanelLayout(layout([
      widget('a', 'stocks', '4x2'),
      widget('b', 'stocks', '4x4', 0, 2),
      widget('c', 'stocks', '2x4', 0, 6),
    ]), 'monitor', false, SLOTS);
    expect(result.pages[0].widgets.map(w => w.size)).toEqual(['2x2', '2x2', '2x4']);
  });

  it('drops a widget that has no size on the narrow grid', () => {
    const result = normalizePanelLayout(layout([widget('a', 'processes', '4x2')]), 'monitor', false, SLOTS);
    expect(result.pages[0].widgets).toEqual([]);
  });

  it('leaves 4-wide sizes alone without the override', () => {
    const result = normalizePanelLayout(layout([widget('a', 'stocks', '4x4')]), 'monitor', false);
    expect(result.pages[0].widgets[0].size).toBe('4x4');
  });
});

describe('fitLayoutToSinglePage', () => {
  const capacity = { gridCols: 2, pageRows: 8 };

  it('returns the input when it already fits', () => {
    const l = layout([widget('a', 'stocks', '2x2'), widget('b', 'stocks', '2x4', 0, 2)]);
    expect(fitLayoutToSinglePage(l, capacity)).toEqual({ layout: l, dropped: [] });
  });

  it('relocates an overlapping widget and drops what has no room', () => {
    const l = layout([
      widget('a', 'stocks', '2x4', 0, 0),
      widget('b', 'stocks', '2x4', 0, 0),
      widget('c', 'stocks', '2x2', 0, 4),
    ]);
    const result = fitLayoutToSinglePage(l, capacity);
    expect(result.dropped.map(w => w.id)).toEqual(['c']);
    expect(result.layout.pages[0].widgets.map(w => [w.id, w.row])).toEqual([['a', 0], ['b', 4]]);
  });

  it('pulls widgets from later pages onto the one page', () => {
    const l: PanelLayout = {
      ...layout([widget('a', 'stocks', '2x2')]),
      pages: [
        { id: 'p1', widgets: [widget('a', 'stocks', '2x2')] },
        { id: 'p2', widgets: [widget('b', 'stocks', '2x2')] },
      ],
    };
    const result = fitLayoutToSinglePage(l, capacity);
    expect(result.layout.pages).toHaveLength(1);
    expect(result.layout.pages[0].widgets.map(w => [w.id, w.row])).toEqual([['a', 0], ['b', 2]]);
  });
});
