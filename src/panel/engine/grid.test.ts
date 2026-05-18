import { describe, it, expect } from 'vitest';
import { panelGridCapacityForCanvas, panelPhysicalSize, sizeToSpan, snapStride, PANEL_GRID_COLS } from './grid';

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
      contentScale: 310,
    });
  });

  it('locks Y70 portrait to a fixed 4x12 grid', () => {
    expect(panelGridCapacityForCanvas(682, 2560, { surface: 'y70', dpi: 337 })).toMatchObject({
      columns: 4,
      rows: 12,
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
