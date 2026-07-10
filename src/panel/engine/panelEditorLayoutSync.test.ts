import { describe, expect, it } from 'vitest';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { normalizePanelLayout } from './usePanelLayout';
import { repaginatePanelLayout, type PaginateCapacity } from './paginate';
import { tryResizeWidget } from './panelLayoutOps';
import { PANEL_GRID_COLS, PANEL_Y70_PORTRAIT_ROWS } from './grid';
import { MAX_PANEL_PAGES } from './panelGrid';

// The panel editor (PanelDevicePage) owns the canonical layout and runs every
// edit through normalizePanelLayout; the iframe simulator renders it after
// repaginatePanelLayout against the runtime capacity. The simulator never
// echoes repagination back (PanelApp gates the auto-persist effect on
// !simulator) - only user edits post layout-changed. That gate exists because
// the two transforms have no common fixed point for every layout: normalize
// repacks overlap at fixed SURFACE_COLS with unbounded rows while repaginate
// clamps to the runtime grid, and echoing repagination ping-ponged them
// through postMessage forever (pegged CPU until the WebView renderer died).
// A layout that settles under the composition is still what editor-initiated
// ops must produce: on a non-fixed point the preview renders a different
// placement than what persists.

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
// so preview and persisted placement match. Returns the iteration at which it
// settled, or -1 if it never settles within `bound` round-trips.
function settlesWithin(
  layout: PanelLayout,
  bound: number,
  surface: PanelLayout['surface'] = 'y70',
  capacity: PaginateCapacity = Y70_CAP,
  deviceTouch?: boolean,
): number {
  let parent = normalizePanelLayout(layout, surface, deviceTouch);
  for (let i = 0; i < bound; i++) {
    const child = repaginatePanelLayout(parent, capacity);
    if (JSON.stringify(child.pages) === JSON.stringify(parent.pages)) return i;
    parent = normalizePanelLayout(child, surface, deviceTouch);
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

  // The two layouts below reproduced the simulator CPU-spike crash: with the
  // repagination echo in place, each cycled parent->child->parent with period
  // 2 forever. They are pinned as non-settling to document WHY the simulator
  // must not echo repagination - if either starts settling, the underlying
  // transforms changed and the gate's premise should be re-checked.

  it('a monitor layout wider than the runtime grid never settles (the sim-crash shape)', () => {
    // T1 repro: touch monitor record, canvas 1024x600 at dpi 183 -> runtime
    // 6x4, while normalize repacks overlap at the fixed monitor column count,
    // which is wider. The widget at col 4 is legal there, clamped to col 2
    // (overlap) at 6.
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'monitor',
      pages: [{
        id: 'p1',
        widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 4, 0), w('c', '4x2', 0, 2)],
      }],
    };
    expect(settlesWithin(layout, 20, 'monitor', { gridCols: 6, pageRows: 4 }, true)).toBe(-1);
  });

  it('a phone layout taller than the runtime grid never settles (the tablet-sim-crash shape)', () => {
    // Default phone stack (three 4x2 at rows 0/2/4) against a 4x4 runtime
    // grid: repaginate clamps rows to <=2 (overlap kept, over-capacity),
    // normalize repacks the overlap back down unbounded rows.
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'phone',
      pages: [{
        id: 'p1',
        widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 0, 2), w('c', '4x2', 0, 4)],
      }],
    };
    expect(settlesWithin(layout, 20, 'phone', { gridCols: 4, pageRows: 4 })).toBe(-1);
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
