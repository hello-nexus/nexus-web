// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DesktopImportDto, DesktopImportWidgetDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { bestGridSlots, hasPendingImport, importBase, kioskOriginFromSearch, planDesktopImport, type ImportViewport } from './desktopImport';
import { panelWidgetPaddingRatio } from './grid';

const PAD = 100;
const emptyLayout = (): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'monitor', pages: [{ id: 'p1', widgets: [] }] });
const widget = (id: string, col: number, row: number, size = '2x2', extra: Partial<DesktopImportWidgetDto> = {}): DesktopImportWidgetDto =>
  ({ id, type: 'clock', size, col, row, ...extra });
const imp = (widgets: DesktopImportWidgetDto[], extra: Partial<DesktopImportDto> = {}): DesktopImportDto =>
  ({ version: 1, cellPx: 86, cellUnits: 'device', merge: false, widgets, ...extra });

const FIXTURES: Array<{ name: string; vp: ImportViewport; maxError: number }> = [
  { name: '2560x1440 at 1', vp: { w: 2560, h: 1440, dpr: 1 }, maxError: 0.02 },
  { name: '1536x864 at 1.25', vp: { w: 1536, h: 864, dpr: 1.25 }, maxError: 0.06 },
  { name: 'portrait 1440x2560 at 1', vp: { w: 1440, h: 2560, dpr: 1 }, maxError: 0.02 },
];

describe('density', () => {
  for (const f of FIXTURES) {
    it(`matches the legacy visible cell on ${f.name}`, () => {
      const plan = planDesktopImport(imp([widget('a', 0, 0)]), f.vp, PAD, emptyLayout());
      // Reported so a regression in the match is visible in the run output.
      console.info(`[desktopImport] ${f.name}: slots ${plan.gridSlots}, cell ${plan.grid.colSize.toFixed(2)} vs legacy ${plan.legacyCell.toFixed(2)}, error ${(plan.cellError * 100).toFixed(2)}%`);
      expect(plan.cellError).toBeLessThanOrEqual(f.maxError);
      expect(plan.gridSlots! % 2).toBe(0);
    });
  }

  it('matches the cell, not the stride', () => {
    const { grid } = bestGridSlots({ w: 2560, h: 1440, dpr: 1 }, panelWidgetPaddingRatio(PAD), 74);
    expect(Math.abs(grid.colSize - 74)).toBeLessThan(Math.abs(grid.colSize - 86));
  });

  it('breaks a tie toward the smaller count', () => {
    const vp = { w: 2560, h: 1440, dpr: 1 };
    const ratio = panelWidgetPaddingRatio(PAD);
    const a = bestGridSlots(vp, ratio, 1);
    expect(a.slots).toBe(64);
    const b = bestGridSlots(vp, ratio, 100000);
    expect(b.slots).toBe(2);
  });

  it('treats css units as already in css px', () => {
    const device = planDesktopImport(imp([widget('a', 0, 0)], { cellUnits: 'device' }), { w: 1536, h: 864, dpr: 2 }, PAD, emptyLayout());
    const css = planDesktopImport(imp([widget('a', 0, 0)], { cellUnits: 'css' }), { w: 1536, h: 864, dpr: 2 }, PAD, emptyLayout());
    expect(device.legacyCell).toBeLessThan(css.legacyCell);
  });
});

describe('positions', () => {
  const vp = { w: 2560, h: 1440, dpr: 1 };

  it('rounds quarter-cell positions to the nearest panel cell', () => {
    const plan = planDesktopImport(imp([widget('a', 0, 0, '1x1'), widget('b', 3.25, 2.5, '1x1')]), vp, PAD, emptyLayout());
    const [a, b] = plan.layout.pages[0].widgets;
    expect(a).toMatchObject({ col: 0, row: 0 });
    const stride = plan.grid.colSize + plan.grid.gap;
    const x = 3.25 * 86 + 6;
    expect(b.col).toBe(Math.round((x - plan.grid.padding) / stride));
  });

  it('clamps a widget stored past the viewport onto the grid', () => {
    const plan = planDesktopImport(imp([widget('a', 500, 500, '2x2')]), vp, PAD, emptyLayout());
    const w = plan.layout.pages[0].widgets[0];
    expect(w.col + 2).toBeLessThanOrEqual(plan.grid.columns);
    expect(w.row + 2).toBeLessThanOrEqual(plan.grid.rows);
  });

  it('moves an overlapping widget to the nearest free cell', () => {
    const plan = planDesktopImport(imp([widget('a', 1, 1, '2x2'), widget('b', 1, 1, '2x2')]), vp, PAD, emptyLayout());
    const [a, b] = plan.layout.pages[0].widgets;
    expect(plan.layout.pages).toHaveLength(1);
    const overlap = a.col < b.col + 2 && b.col < a.col + 2 && a.row < b.row + 2 && b.row < a.row + 2;
    expect(overlap).toBe(false);
  });

  it('spills to a second page when the first is full', () => {
    const many = Array.from({ length: 400 }, (_, i) => widget(`w${i}`, (i % 40) * 1, Math.floor(i / 40), '4x4'));
    const plan = planDesktopImport(imp(many), vp, PAD, emptyLayout());
    expect(plan.layout.pages.length).toBeGreaterThan(1);
    expect(plan.layout.pages.flatMap(p => p.widgets)).toHaveLength(400);
  });

  it('keeps id, type, size, config and lock', () => {
    const w = widget('keep', 2, 2, '4x2', { type: 'app:com.example.x', locked: true, config: { a: 1 } });
    const plan = planDesktopImport(imp([w]), vp, PAD, emptyLayout());
    expect(plan.layout.pages[0].widgets[0]).toMatchObject({ id: 'keep', type: 'app:com.example.x', size: '4x2', locked: true, config: { a: 1 } });
  });

  it('gives a duplicate id inside the import a fresh id', () => {
    const plan = planDesktopImport(imp([widget('same', 0, 0, '1x1'), widget('same', 6, 6, '1x1')]), vp, PAD, emptyLayout());
    const ids = plan.layout.pages.flatMap(p => p.widgets.map(w => w.id));
    expect(new Set(ids).size).toBe(2);
  });
});

describe('merge and idempotence', () => {
  const vp = { w: 2560, h: 1440, dpr: 1 };

  it('merge keeps the current grid and the existing widgets', () => {
    const current = planDesktopImport(imp([widget('x', 0, 0)]), vp, PAD, emptyLayout());
    const layout = current.layout;
    const merged = planDesktopImport(imp([widget('n', 4, 4)], { merge: true }), vp, PAD, layout, { ...current.grid, columns: 8, rows: 6, cellSize: 200, rowSize: 200 });
    expect(merged.gridSlots).toBeUndefined();
    expect(merged.grid.rowSize).toBe(200);
    expect(merged.layout.pages[0].widgets.map(w => w.id).sort()).toEqual(['n', 'x']);
  });

  it('skips ids already on the panel', () => {
    const first = planDesktopImport(imp([widget('a', 0, 0), widget('b', 4, 4)]), vp, PAD, emptyLayout());
    const again = planDesktopImport(imp([widget('a', 0, 0), widget('b', 4, 4)]), vp, PAD, first.layout);
    expect(again.layout.pages.flatMap(p => p.widgets)).toEqual(first.layout.pages.flatMap(p => p.widgets));
  });

  it('detects a pending import', () => {
    expect(hasPendingImport(null)).toBe(false);
    expect(hasPendingImport(imp([]))).toBe(true);
  });
});

describe('importBase', () => {
  const vp = { w: 2560, h: 1440, dpr: 1 };

  it('keeps a user-edited layout and its grid whatever the record said', () => {
    const edited = planDesktopImport(imp([widget('mine', 3, 3)]), vp, PAD, emptyLayout());
    const { imp: merged, base } = importBase(imp([widget('legacy', 0, 0)], { merge: false }), edited.layout);
    expect(merged.merge).toBe(true);
    const plan = planDesktopImport(merged, vp, PAD, base, edited.grid);
    expect(plan.gridSlots).toBeUndefined();
    expect(plan.layout.pages.flatMap(p => p.widgets).map(w => w.id).sort()).toEqual(['legacy', 'mine']);
  });

  it('chooses density only for an empty layout, even when the record said merge', () => {
    const { imp: fresh } = importBase(imp([widget('a', 0, 0)], { merge: true }), emptyLayout());
    expect(fresh.merge).toBe(false);
    expect(planDesktopImport(fresh, vp, PAD, emptyLayout()).gridSlots).toBeDefined();
  });
});

describe('kiosk origin', () => {
  const base = { w: 2560, h: 1440, dpr: 1 };
  const one = imp([widget('a', 4, 4, '1x1')]);

  it('reads the origin params and defaults to a full-frame window', () => {
    expect(kioskOriginFromSearch('?originX=80&originY=25')).toEqual({ originX: 80, originY: 25 });
    expect(kioskOriginFromSearch('?x=1')).toEqual({ originX: 0, originY: 0 });
    expect(kioskOriginFromSearch('?originX=oops')).toEqual({ originX: 0, originY: 0 });
    expect(kioskOriginFromSearch('?originY=25&fullW=1920&fullH=1080')).toEqual({ originX: 0, originY: 25, fullW: 1920, fullH: 1080 });
  });

  it('clamps against the reported full frame when present', () => {
    const far = imp([widget('far', 60, 40, '1x1')]);
    const withFull = planDesktopImport(far, { ...base, originX: 120, fullW: 1920, fullH: 1080 }, PAD, emptyLayout());
    const without = planDesktopImport(far, { ...base, originX: 120 }, PAD, emptyLayout());
    // The 1920 wide frame ends a few cells in; clamping against the larger viewport plus origin would reach further.
    expect(withFull.layout.pages[0].widgets[0].col).toBeLessThanOrEqual(without.layout.pages[0].widgets[0].col);
    const stride = withFull.grid.colSize + withFull.grid.gap;
    const maxX = (1920 / 86 - 1) * 86 + 6 - 120;
    expect(withFull.layout.pages[0].widgets[0].col).toBe(Math.min(withFull.grid.columns - 1, Math.round((maxX - withFull.grid.padding) / stride)));
  });

  it('shifts a widget up by a top menu bar offset', () => {
    const flat = planDesktopImport(one, base, PAD, emptyLayout());
    const shifted = planDesktopImport(one, { ...base, originY: 25 }, PAD, emptyLayout(), undefined);
    const stride = flat.grid.rowSize + flat.grid.gap;
    const legacyY = 4 * 86 + 6;
    expect((legacyY - 25 - shifted.grid.padding) / stride).toBeCloseTo(shifted.layout.pages[0].widgets[0].row, 0);
    expect(shifted.layout.pages[0].widgets[0].col).toBe(flat.layout.pages[0].widgets[0].col);
  });

  it('shifts a widget left by a side Dock offset and clamps at the edge', () => {
    const dock = planDesktopImport(one, { ...base, originX: 120 }, PAD, emptyLayout());
    const flat = planDesktopImport(one, base, PAD, emptyLayout());
    const stride = flat.grid.colSize + flat.grid.gap;
    expect(dock.layout.pages[0].widgets[0].col).toBe(Math.round((4 * 86 + 6 - 120 - dock.grid.padding) / stride));
    const edge = planDesktopImport(imp([widget('e', 0, 0, '1x1')]), { ...base, originX: 120, originY: 25 }, PAD, emptyLayout());
    expect(edge.layout.pages[0].widgets[0]).toMatchObject({ col: 0, row: 0 });
  });
});
