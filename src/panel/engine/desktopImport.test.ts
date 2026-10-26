// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DesktopImportDto, DesktopImportWidgetDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { bestGridSlots, hasPendingImport, planDesktopImport, type ImportViewport } from './desktopImport';
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
      console.info(`[desktopImport] ${f.name}: slots ${plan.gridSlots}, cell ${plan.grid.cellSize.toFixed(2)} vs legacy ${plan.legacyCell.toFixed(2)}, error ${(plan.cellError * 100).toFixed(2)}%`);
      expect(plan.cellError).toBeLessThanOrEqual(f.maxError);
      expect(plan.gridSlots! % 2).toBe(0);
    });
  }

  it('matches the cell, not the stride', () => {
    const { grid } = bestGridSlots({ w: 2560, h: 1440, dpr: 1 }, panelWidgetPaddingRatio(PAD), 74);
    expect(Math.abs(grid.cellSize - 74)).toBeLessThan(Math.abs(grid.cellSize - 86));
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
    const stride = plan.grid.cellSize + plan.grid.gap;
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
    expect(merged.grid.cellSize).toBe(200);
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
