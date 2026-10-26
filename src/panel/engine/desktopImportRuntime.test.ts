// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import legacyOverlay from './__fixtures__/legacyOverlay.json';
import type { DesktopImportDto } from '../../api/panel';
import { sizeToSpan, panelWidgetPaddingRatio } from './grid';
import { readRuntimePanelGrid } from './panelGrid';
import { planDesktopImport } from './desktopImport';
import type { PanelLayout } from '../types';

const PAD = 100;
const empty = (): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'monitor', pages: [{ id: 'p1', widgets: [] }] });

function setViewport(w: number, h: number, dpr: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
}

// What the grid CSS renders: columns share the width under 1fr tracks, rows take the row size.
function rendered(grid: ReturnType<typeof readRuntimePanelGrid>, vpW: number, c: number, r: number, size: string) {
  const span = sizeToSpan(size);
  const colSize = (vpW - grid.padding * 2 - grid.gap * (grid.columns - 1)) / grid.columns;
  return {
    x: grid.padding + c * (colSize + grid.gap),
    y: grid.padding + r * (grid.rowSize + grid.gap),
    w: span.cols * colSize + (span.cols - 1) * grid.gap,
    h: span.rows * grid.rowSize + (span.rows - 1) * grid.gap,
    colSize,
  };
}

describe('desktop import against the runtime grid', () => {
  beforeEach(() => setViewport(1920, 1080, 1));

  it('places the legacy layout on a 1920x1080 primary at Scale 137 within the cell rounding', () => {
    const scale = legacyOverlay.scale;
    const stride = Math.round(86 * scale / 100 * 100) / 100;
    const imp: DesktopImportDto = {
      version: 1, cellPx: 86 * scale / 100, cellUnits: 'device', merge: false,
      widgets: legacyOverlay.layout.map(w => ({ id: w.id, type: w.type, size: w.size, col: w.col, row: w.row })),
    };
    const plan = planDesktopImport(imp, { w: 1920, h: 1080, dpr: 1 }, PAD, empty());
    const runtime = readRuntimePanelGrid('monitor', null, false, undefined, panelWidgetPaddingRatio(PAD), plan.gridSlots);
    expect(runtime.columns).toBe(plan.grid.columns);
    expect(runtime.rows).toBe(plan.grid.rows);

    const inset = 6;
    const rows: string[] = [];
    let worstPos = 0;
    let worstSize = 0;
    for (const w of plan.layout.pages.flatMap(p => p.widgets)) {
      const legacy = imp.widgets.find(l => l.id === w.id)!;
      const span = sizeToSpan(legacy.size);
      const r = rendered(runtime, 1920, w.col, w.row, w.size);
      const dx = r.x - (legacy.col * (86 * scale / 100) + inset);
      const dy = r.y - (legacy.row * (86 * scale / 100) + inset);
      const dw = r.w - (span.cols * (86 * scale / 100) - inset * 2);
      const dh = r.h - (span.rows * (86 * scale / 100) - inset * 2);
      rows.push(`${w.type} ${w.size} dx ${dx.toFixed(1)} dy ${dy.toFixed(1)} dw ${dw.toFixed(1)} dh ${dh.toFixed(1)}`);
      worstPos = Math.max(worstPos, Math.abs(dx), Math.abs(dy));
      worstSize = Math.max(worstSize, Math.abs(dw), Math.abs(dh));
    }
    console.info(`[desktopImport] 1920x1080 scale ${scale}: slots ${plan.gridSlots}, ${runtime.columns}x${runtime.rows}, col ${plan.grid.colSize.toFixed(1)} row ${plan.grid.rowSize.toFixed(1)} gap ${plan.grid.gap.toFixed(1)} stride ${stride}\n${rows.join('\n')}\nworst pos ${worstPos.toFixed(1)} worst size ${worstSize.toFixed(1)}`);
    // Quarter-cell legacy positions snap to whole cells (half a stride at best); the legacy layout also overlaps, so a displaced widget can sit a stride away.
    expect(worstPos).toBeLessThanOrEqual(plan.grid.colSize + plan.grid.gap);
    // The runtime stretches 16 columns over the width, so the cell is not square; the match is within a tenth in both axes.
    expect(worstSize).toBeLessThan(20);
    expect(plan.cellError).toBeLessThan(0.1);
    expect(Math.abs(plan.grid.colSize - plan.grid.rowSize) / plan.legacyCell).toBeLessThan(0.15);
  });
});
