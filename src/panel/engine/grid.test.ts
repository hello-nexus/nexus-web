// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  panelGridCapacityForCanvas,
  panelPhysicalSize,
  panelWidgetPaddingRatio,
  resolvePanelSpacing,
  sizeToSpan,
  snapStride,
  PANEL_GRID_COLS,
  PANEL_WIDGET_PADDING_DEFAULT_PERCENT,
  PANEL_WIDGET_PADDING_MAX_RATIO,
} from './grid';

describe('panelWidgetPaddingRatio', () => {
  it('maps percent linearly onto the max ratio', () => {
    expect(panelWidgetPaddingRatio(0)).toBe(0);
    expect(panelWidgetPaddingRatio(25)).toBeCloseTo(PANEL_WIDGET_PADDING_MAX_RATIO * 0.25, 10);
    expect(panelWidgetPaddingRatio(50)).toBeCloseTo(PANEL_WIDGET_PADDING_MAX_RATIO * 0.5, 10);
    expect(panelWidgetPaddingRatio(75)).toBeCloseTo(PANEL_WIDGET_PADDING_MAX_RATIO * 0.75, 10);
    expect(panelWidgetPaddingRatio(100)).toBeCloseTo(PANEL_WIDGET_PADDING_MAX_RATIO, 10);
  });

  it('clamps out-of-range percent to 0-100', () => {
    expect(panelWidgetPaddingRatio(-10)).toBe(0);
    expect(panelWidgetPaddingRatio(150)).toBeCloseTo(PANEL_WIDGET_PADDING_MAX_RATIO, 10);
  });
});

describe('sizeToSpan', () => {
  it('maps all widget sizes correctly', () => {
    expect(sizeToSpan('1x1')).toEqual({ cols: 1, rows: 1 });
    expect(sizeToSpan('2x2')).toEqual({ cols: 2, rows: 2 });
    expect(sizeToSpan('2x4')).toEqual({ cols: 2, rows: 4 });
    expect(sizeToSpan('4x2')).toEqual({ cols: 4, rows: 2 });
    expect(sizeToSpan('4x4')).toEqual({ cols: 4, rows: 4 });
  });

  it('never exceeds the grid column count', () => {
    for (const size of ['1x1', '2x2', '2x4', '4x2', '4x4'] as const) {
      expect(sizeToSpan(size).cols).toBeLessThanOrEqual(PANEL_GRID_COLS);
    }
  });

  it('fits Q60 as a 2x4 stretched grid at native 9:16 resolution', () => {
    expect(panelGridCapacityForCanvas(720, 1280, { surface: 'q60', dpi: 220 })).toMatchObject({
      columns: 2,
      rows: 4,
      cellSize: 348,
      rowSize: 310,
      contentScale: 348,
    });
  });

  it('locks Y70 portrait to a fixed 4x16 grid', () => {
    expect(panelGridCapacityForCanvas(682, 2560, { surface: 'y70', dpi: 337 })).toMatchObject({
      columns: 4,
      rows: 16,
    });
  });

  it('transposes the Y70 grid to 16x4 in landscape', () => {
    // 2.5K and 4K models both keep the fixed long-axis cell count as columns
    // and the short-axis slot count as rows.
    expect(panelGridCapacityForCanvas(2560, 682, { surface: 'y70', dpi: 337 })).toMatchObject({
      columns: 16,
      rows: 4,
    });
    expect(panelGridCapacityForCanvas(3840, 1100, { surface: 'y70', dpi: 283 })).toMatchObject({
      columns: 16,
      rows: 4,
    });
  });

  it('keeps Y70 cell geometry and gap identical across a rotation', () => {
    const ratio = panelWidgetPaddingRatio(50);
    const portrait = panelGridCapacityForCanvas(682, 2560, { surface: 'y70', dpi: 337, paddingRatio: ratio });
    const landscape = panelGridCapacityForCanvas(2560, 682, { surface: 'y70', dpi: 337, paddingRatio: ratio });
    expect(landscape.gap).toBeCloseTo(portrait.gap, 6);
    expect(landscape.padding).toBeCloseTo(portrait.padding, 6);
    expect(landscape.cellSize).toBeCloseTo(portrait.rowSize, 6);
    expect(landscape.rowSize).toBeCloseTo(portrait.cellSize, 6);
    expect(landscape.columns * landscape.rows).toBe(portrait.columns * portrait.rows);
  });

  it('lets explicit columns/rows bypass the Y70 landscape transpose', () => {
    expect(panelGridCapacityForCanvas(2560, 682, { surface: 'y70', dpi: 337, columns: 4, rows: 2 })).toMatchObject({
      columns: 4,
      rows: 2,
    });
  });

  it('uses physical short side to give tablets more columns than phones', () => {
    expect(panelPhysicalSize(1206, 2622, 460).shortSideInches).toBeCloseTo(2.6, 1);
    expect(panelPhysicalSize(1206, 2622, 460).diagonalInches).toBeCloseTo(6.3, 1);
    expect(panelGridCapacityForCanvas(1206, 2622, { surface: 'phone', dpi: 460 })).toMatchObject({
      columns: 4,
      rows: 8,
    });
    expect(panelPhysicalSize(1640, 2360, 264).shortSideInches).toBeCloseTo(6.2, 1);
    expect(panelPhysicalSize(1640, 2360, 264).diagonalInches).toBeCloseTo(10.9, 1);
    expect(panelGridCapacityForCanvas(1640, 2360, { surface: 'phone', dpi: 264 })).toMatchObject({
      columns: 8,
      rows: 10,
    });
  });

  it('derives phone landscape columns from the long axis', () => {
    expect(panelGridCapacityForCanvas(2622, 1206, { surface: 'phone', dpi: 460 })).toMatchObject({
      columns: 8,
      rows: 4,
    });
  });

  it('lets the grid jump cutoff be tuned', () => {
    expect(panelGridCapacityForCanvas(1640, 2360, {
      surface: 'phone',
      dpi: 264,
      sizing: { shortSideJumpAtInches: 7 },
    })).toMatchObject({
      columns: 4,
    });
  });

  it('maps removed legacy sizes to 4x4', () => {
    expect(sizeToSpan('4x8')).toEqual({ cols: 4, rows: 4 });
  });

  // Corsair Xeneon Edge (2560x720, 14.5" -> 183 px/in) promoted as a monitor
  // panel. Its 3.9" short side stays under the 4" column jump, so the short
  // axis carries 4 slots: a 4x4 widget spans the full short axis and content
  // renders at ~1.9x (cell 170 vs the 90px reference).
  it('gives the Xeneon Edge 4 rows of large cells in landscape', () => {
    expect(panelGridCapacityForCanvas(2560, 720, { surface: 'monitor', dpi: 183 })).toMatchObject({
      columns: 14,
      rows: 4,
      cellSize: 170,
      contentScale: 170,
    });
  });

  it('gives the Xeneon Edge 4 columns of large cells in portrait', () => {
    expect(panelGridCapacityForCanvas(720, 2560, { surface: 'monitor', dpi: 183 })).toMatchObject({
      columns: 4,
      rows: 14,
      cellSize: 170,
      contentScale: 170,
    });
  });

  it('keeps the generic desk-monitor density estimate without a device dpi', () => {
    // At the 110dpi monitor default the short side reads as over the 4"
    // column jump, so the short axis carries 8 slots.
    expect(panelGridCapacityForCanvas(2560, 720, { surface: 'monitor', dpi: 110 })).toMatchObject({
      columns: 28,
      rows: 8,
    });
  });
});

describe('snapStride', () => {
  it('returns 1 for a 1-cell span so 1x1 widgets walk every cell', () => {
    expect(snapStride(1)).toBe(1);
  });

  it('returns 2 for any multi-cell span so 4x4 lands on 2-cell increments', () => {
    expect(snapStride(2)).toBe(2);
    expect(snapStride(4)).toBe(2);
    expect(snapStride(8)).toBe(2);
  });
});

describe('resolvePanelSpacing', () => {
  it('solves gap = padding = ratio * cellSize exactly, satisfying the perimeter equation', () => {
    for (const [extent, count, ratio] of [[734, 4, 0.045], [2560, 14, 0.079], [1206, 8, 0.045]] as const) {
      const { gap, padding, cellSize } = resolvePanelSpacing(extent, count, ratio);
      expect(padding).toBe(gap);
      expect(gap).toBeCloseTo(ratio * cellSize, 10);
      // count cells + (count - 1) internal gaps + 2 outer paddings reconstructs extent.
      expect(count * cellSize + (count - 1) * gap + 2 * padding).toBeCloseTo(extent, 6);
    }
  });

  it('collapses to zero gap/padding at ratio 0', () => {
    expect(resolvePanelSpacing(1000, 4, 0)).toEqual({ gap: 0, padding: 0, cellSize: 250 });
  });
});

describe('panelGridCapacityForCanvas paddingRatio', () => {
  it('keeps gap/padding at the flat 8/8 default when paddingRatio is omitted (backward compatible)', () => {
    const cap = panelGridCapacityForCanvas(734, 2560, { surface: 'y70', dpi: 337 });
    expect(cap.gap).toBe(8);
    expect(cap.padding).toBe(8);
  });

  it('resolves gap/padding to the same proportion of the cell on every surface at a given ratio', () => {
    const small = panelWidgetPaddingRatio(50);
    const large = panelWidgetPaddingRatio(100);
    expect(small).toBeCloseTo(0.045, 5);
    expect(large).toBeCloseTo(0.09, 5);

    // Ground-truth device canvases from the panel gap/padding proportionality
    // work: two y70 panel resolutions, the Xeneon Edge (a 'monitor' surface),
    // and a tablet-class phone. Widely different cell sizes; gap/cellSize
    // must land on the same ratio for every one.
    const devices: { width: number; height: number; surface: 'y70' | 'monitor' | 'phone'; dpi: number }[] = [
      { width: 734, height: 2560, surface: 'y70', dpi: 337 },
      { width: 1100, height: 3840, surface: 'y70', dpi: 337 },
      { width: 2560, height: 720, surface: 'monitor', dpi: 183 },
      { width: 1206, height: 2622, surface: 'phone', dpi: 460 },
    ];
    for (const { width, height, surface, dpi } of devices) {
      for (const ratio of [small, large]) {
        const cap = panelGridCapacityForCanvas(width, height, { surface, dpi, paddingRatio: ratio });
        expect(cap.gap / cap.cellSize).toBeCloseTo(ratio, 5);
        expect(cap.padding).toBe(cap.gap);
      }
    }
  });

  it('solves the render scale at the stock padding whatever the slider says, on every surface', () => {
    const stock = panelWidgetPaddingRatio(PANEL_WIDGET_PADDING_DEFAULT_PERCENT);
    const devices: { width: number; height: number; surface: 'y70' | 'monitor' | 'phone'; dpi: number }[] = [
      { width: 734, height: 2560, surface: 'y70', dpi: 337 },
      { width: 2560, height: 734, surface: 'y70', dpi: 337 },
      { width: 2560, height: 720, surface: 'monitor', dpi: 183 },
      { width: 1206, height: 2622, surface: 'phone', dpi: 460 },
      { width: 2622, height: 1206, surface: 'phone', dpi: 460 },
    ];
    for (const { width, height, surface, dpi } of devices) {
      const reference = panelGridCapacityForCanvas(width, height, { surface, dpi, paddingRatio: stock });
      expect(reference.contentScale).toBeCloseTo(reference.cellSize, 6);
      for (const percent of [0, 50]) {
        const cap = panelGridCapacityForCanvas(width, height, { surface, dpi, paddingRatio: panelWidgetPaddingRatio(percent) });
        expect(cap.contentScale).toBeCloseTo(reference.contentScale, 6);
        // The live cell still moves with the slider: less padding, bigger cell.
        expect(cap.cellSize).toBeGreaterThan(reference.cellSize);
      }
    }
  });

  it('forces q60 (a single-widget surface) to zero gap/padding regardless of the ratio', () => {
    const large = panelWidgetPaddingRatio(100);
    const cap = panelGridCapacityForCanvas(720, 1280, { surface: 'q60', dpi: 220, paddingRatio: large });
    expect(cap.gap).toBe(0);
    expect(cap.padding).toBe(0);
    // Fully edge-to-edge: with zero gap/padding the 2-column cell is exactly
    // half the canvas width, unaffected by the nonzero widget-padding setting.
    expect(cap.cellSize).toBe(360);
    // No slider on this surface, so the render scale follows its own cell.
    expect(cap.contentScale).toBe(360);
  });
});
