import { describe, expect, it } from 'vitest';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { normalizePanelLayout } from './usePanelLayout';
import { repaginatePanelLayout, type PaginateCapacity } from './paginate';
import { tryResizeWidget } from './panelLayoutOps';
import { PANEL_GRID_COLS, PANEL_Y70_PORTRAIT_ROWS } from './grid';
import { MAX_PANEL_PAGES } from './panelGrid';

// The panel editor (PanelDevicePage) owns the canonical layout and runs every
// edit through normalizePanelLayout; the iframe simulator renders it and runs
// repaginatePanelLayout against the runtime capacity, echoing any change back
// over postMessage. A layout is stable in the editor ONLY if it is a fixed
// point under both: if repaginatePanelLayout changes the normalized layout, the
// simulator echoes a different layout, the editor re-normalizes it, and the two
// ping-pong forever - the resize never settles and the preview flickers.

const Y70_CAP: PaginateCapacity = { gridCols: PANEL_GRID_COLS, pageRows: PANEL_Y70_PORTRAIT_ROWS };
const MAX_PAGES = MAX_PANEL_PAGES;

function w(id: string, size: PanelWidgetSize, col: number, row: number): PanelWidget {
  return { id, type: 'cooling', size, col, row };
}

// 2x2 tiles that exactly fill the fixed y70 portrait grid.
function fullY70Page(): PanelWidget[] {
  const widgets: PanelWidget[] = [];
  let n = 0;
  for (let row = 0; row < PANEL_Y70_PORTRAIT_ROWS; row += 2) {
    for (let col = 0; col < PANEL_GRID_COLS; col += 2) {
      widgets.push(w(`x${n++}`, '2x2', col, row));
    }
  }
  return widgets;
}
const FULL_PAGE_COUNT = fullY70Page().length;

// True if `layout` is a fixed point: the simulator's repaginate makes no change,
// so it never echoes a different layout back. Returns the iteration at which it
// settled, or -1 if it never settles within `bound` round-trips.
function settlesWithin(layout: PanelLayout, bound: number): number {
  let parent = normalizePanelLayout(layout, 'y70');
  for (let i = 0; i < bound; i++) {
    const child = repaginatePanelLayout(parent, Y70_CAP);
    if (JSON.stringify(child.pages) === JSON.stringify(parent.pages)) return i;
    parent = normalizePanelLayout(child, 'y70');
  }
  return -1;
}

describe('panel editor layout sync', () => {
  it('the legacy in-place resize on a full page never settles (the flicker)', () => {
    const base: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{ id: 'p1', widgets: fullY70Page() }],
    };
    // Old editor path: grow a tile in place, discard other pages.
    const inPlace: PanelLayout = {
      ...base,
      pages: [{ ...base.pages[0], widgets: base.pages[0].widgets.map(x => x.id === 'x0' ? { ...x, size: '4x4' } : x) }],
    };
    expect(settlesWithin(inPlace, 20)).toBe(-1);
  });

  it('resizing via tryResizeWidget paginates the grow and settles immediately', () => {
    const base: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{ id: 'p1', widgets: fullY70Page() }],
    };
    const resized = tryResizeWidget(base, 'x0', '4x4', Y70_CAP, MAX_PAGES);
    expect(resized).not.toBeNull();
    // The displaced tiles cascade onto a second page; no page is over capacity.
    expect(resized!.pages.length).toBe(2);
    expect(settlesWithin(resized!, 20)).toBe(0);
  });

  it('shrinking a tile on a full page settles immediately', () => {
    const base: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{ id: 'p1', widgets: fullY70Page() }],
    };
    const resized = tryResizeWidget(base, 'x0', '1x1', Y70_CAP, MAX_PAGES);
    expect(resized).not.toBeNull();
    expect(settlesWithin(resized!, 20)).toBe(0);
  });

  it('resizing a widget that lives on a later page keeps every page', () => {
    const base: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [
        { id: 'p1', widgets: fullY70Page() },
        { id: 'p2', widgets: [w('late', '2x2', 0, 0)] },
      ],
    };
    const resized = tryResizeWidget(base, 'late', '4x2', Y70_CAP, MAX_PAGES);
    expect(resized).not.toBeNull();
    // Page 1 is untouched; the page-2 widget is still present at its new size.
    expect(resized!.pages[0].widgets).toHaveLength(FULL_PAGE_COUNT);
    const found = resized!.pages.flatMap(p => p.widgets).find(x => x.id === 'late');
    expect(found?.size).toBe('4x2');
    expect(settlesWithin(resized!, 20)).toBe(0);
  });
});
