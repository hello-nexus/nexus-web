// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { normalizePanelLayout } from './usePanelLayout';
import { repaginatePanelLayout, type PaginateCapacity } from './paginate';
import { tryResizeWidget } from './panelLayoutOps';
import { PANEL_GRID_COLS, PANEL_Y70_LONG_AXIS_CELLS } from './grid';
import { MAX_PANEL_PAGES } from './panelGrid';

// The panel editor (PanelDevicePage) owns the canonical layout and runs every
// edit through normalizePanelLayout + repaginatePanelLayout at the editor
// capacity; the iframe simulator renders the same composition at the runtime
// capacity. normalizePanelLayout is geometry-neutral (registry reconcile +
// size snap only) and repaginatePanelLayout is idempotent, so the composition
// reaches a fixed point within ONE pass for any layout at any capacity - the
// invariant the matrix test below pins. History: normalize used to repack
// overlap at fixed per-surface columns with unbounded rows, which shared no
// fixed point with repaginate's bounded clamp; echoing repagination through
// the simulator postMessage sync then ping-ponged the two forever (pegged CPU
// until the WebView renderer died). No render path writes repagination back
// (PanelApp keeps it render-only) - the parent owns the persisted bytes; only
// user edits post layout-changed.

const Y70_CAP: PaginateCapacity = { gridCols: PANEL_GRID_COLS, pageRows: PANEL_Y70_LONG_AXIS_CELLS };
const MAX_PAGES = MAX_PANEL_PAGES;

function w(id: string, size: PanelWidgetSize, col: number, row: number): PanelWidget {
  return { id, type: 'cooling', size, col, row };
}

// 2x2 tiles that exactly fill the fixed y70 portrait grid.
function fullY70Page(): PanelWidget[] {
  const widgets: PanelWidget[] = [];
  let n = 0;
  for (let row = 0; row < PANEL_Y70_LONG_AXIS_CELLS; row += 2) {
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
  it('an in-place grow on a full page settles immediately, rendered stacked', () => {
    const base: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{ id: 'p1', widgets: fullY70Page() }],
    };
    // A raw in-place grow over-fills the page. The composition settles (the
    // over-capacity page keeps its clamped, overlapping positions - a stable
    // fixed point), but the widgets render stacked; tryResizeWidget exists so
    // an editor grow paginates instead of ever producing this shape.
    const inPlace: PanelLayout = {
      ...base,
      pages: [{ ...base.pages[0], widgets: base.pages[0].widgets.map(x => x.id === 'x0' ? { ...x, size: '4x4' } : x) }],
    };
    expect(settlesWithin(inPlace, 20)).toBe(0);
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

  // The two layouts below reproduced the simulator CPU-spike crash while
  // normalize still repacked overlap at fixed per-surface columns: each cycled
  // parent->child->parent with period 2 forever. With normalize
  // geometry-neutral they settle in one clamp pass - kept as regression pins
  // of the crash shapes.

  it('a monitor layout wider than the runtime grid settles in one clamp pass (the sim-crash shape)', () => {
    // T1 repro: touch monitor record, canvas 1024x600 at dpi 183 -> runtime
    // 6x4, holding a layout authored on a wider grid (widget at col 4).
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'monitor',
      pages: [{
        id: 'p1',
        widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 4, 0), w('c', '4x2', 0, 2)],
      }],
    };
    expect(settlesWithin(layout, 20, 'monitor', { gridCols: 6, pageRows: 4 }, true)).toBe(1);
  });

  it('a phone layout taller than the runtime grid settles in one clamp pass (the tablet-sim-crash shape)', () => {
    // Default phone stack (three 4x2 at rows 0/2/4) against a 4x4 runtime
    // grid: repaginate clamps rows to <=2 and the over-capacity page keeps
    // the clamped positions - a stable fixed point.
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'phone',
      pages: [{
        id: 'p1',
        widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 0, 2), w('c', '4x2', 0, 4)],
      }],
    };
    expect(settlesWithin(layout, 20, 'phone', { gridCols: 4, pageRows: 4 })).toBe(1);
  });

  // The unification invariant: normalize is geometry-neutral and repaginate
  // is idempotent, so the parent/child composition reaches a fixed point
  // within ONE pass for ANY layout at ANY capacity - matched or not. If any
  // cell of this matrix exceeds 1, a geometry repair crept back into
  // normalize (or repaginate lost idempotence) and the simulator echo class
  // of loop is possible again.
  it('settles within one pass for adversarial layouts at every capacity', () => {
    const shapes: Array<{ name: string; surface: PanelLayout['surface']; widgets: PanelWidget[] }> = [
      { name: 'monitor-crash', surface: 'monitor', widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 4, 0), w('c', '4x2', 0, 2)] },
      { name: 'phone-crash', surface: 'phone', widgets: [w('a', '4x2', 0, 0), w('b', '4x2', 0, 2), w('c', '4x2', 0, 4)] },
      { name: 'over-capacity-grow', surface: 'y70', widgets: fullY70Page().map(x => x.id === 'x0' ? { ...x, size: '4x4' as PanelWidgetSize } : x) },
      { name: 'out-of-bounds', surface: 'phone', widgets: [w('a', '2x2', 10, 40), w('b', '4x4', 6, 2), w('c', '1x1', 3, 999)] },
      { name: 'snap-overlap', surface: 'y70', widgets: [{ id: 'mon', type: 'monitoring', size: '2x4' as PanelWidgetSize, col: 0, row: 0 }, w('sib', '2x2', 2, 0)] },
      { name: 'stacked-same-cell', surface: 'monitor', widgets: [w('a', '4x4', 0, 0), w('b', '4x4', 0, 0), w('c', '2x2', 0, 0)] },
    ];
    const capacities: PaginateCapacity[] = [
      { gridCols: 6, pageRows: 4 },
      { gridCols: 4, pageRows: 4 },
      { gridCols: 4, pageRows: 16 },
      { gridCols: 8, pageRows: 8 },
      { gridCols: 2, pageRows: 4 },
      { gridCols: 14, pageRows: 4 },
    ];
    for (const shape of shapes) {
      for (const capacity of capacities) {
        const layout: PanelLayout = {
          layoutSchemaVersion: 2,
          surface: shape.surface,
          pages: [{ id: 'p1', widgets: shape.widgets }],
        };
        const settled = settlesWithin(layout, 5, shape.surface, capacity, true);
        expect(settled, `${shape.name} at ${capacity.gridCols}x${capacity.pageRows}`).toBeGreaterThanOrEqual(0);
        expect(settled, `${shape.name} at ${capacity.gridCols}x${capacity.pageRows}`).toBeLessThanOrEqual(1);
      }
    }
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
