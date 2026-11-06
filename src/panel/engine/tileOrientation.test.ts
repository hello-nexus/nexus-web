// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isQuarterTurn, rotationClass, rotationCrossesClass, tileTransposed } from './tileOrientation';
import { panelGridCapacityForCanvas } from './grid';
import { normalizePanelLayout } from './usePanelLayout';
import { recordCanvasOf } from './recordCanvas';
import { panelShortSideSlots, singleWidgetSurfaceSize, transposeWidgetSize, type PanelLayout, type PanelSurface } from '../types';

const WIDE = { width: 1280, height: 480 };
const TALL = { width: 480, height: 1280 };

describe('rotation classes', () => {
  it('splits landscape (0, 180) from portrait (90, 270)', () => {
    expect([0, 180].map(rotationClass)).toEqual(['landscape', 'landscape']);
    expect([90, 270].map(rotationClass)).toEqual(['portrait', 'portrait']);
    expect(isQuarterTurn(undefined)).toBe(false);
  });

  it('refetches only when a change crosses a class', () => {
    expect(rotationCrossesClass(0, 90)).toBe(true);
    expect(rotationCrossesClass(270, 180)).toBe(true);
    expect(rotationCrossesClass(0, 180)).toBe(false);
    expect(rotationCrossesClass(90, 270)).toBe(false);
  });
});

describe('transposed single tile', () => {
  it('swaps a wide tile at a quarter turn and leaves 0/180 alone', () => {
    expect(singleWidgetSurfaceSize('lcd-wide')).toBe('4x2');
    expect(singleWidgetSurfaceSize('lcd-wide', true)).toBe('2x4');
    expect(tileTransposed('lcd-wide', 90, TALL)).toBe(true);
    expect(tileTransposed('lcd-wide', 270, TALL)).toBe(true);
    expect(tileTransposed('lcd-wide', 0, WIDE)).toBe(false);
    expect(tileTransposed('lcd-wide', 180, WIDE)).toBe(false);
  });

  it('leaves square and round tiles unchanged at every rotation', () => {
    for (const surface of ['lcd-square', 'lcd-round'] as PanelSurface[]) {
      for (const rotation of [0, 90, 180, 270]) {
        expect(tileTransposed(surface, rotation, TALL)).toBe(false);
        expect(singleWidgetSurfaceSize(surface, true)).toBe(singleWidgetSurfaceSize(surface));
      }
    }
    expect(transposeWidgetSize('2x2round')).toBe('2x2round');
  });

  it('follows the effective size, not the surface: a natively tall glass turns wide', () => {
    // Glacial: 720x1280 native on the square surface (a square tile, so no swap),
    // and a natively tall glass on a wide-tile surface keeps a wide tile once rotated wide.
    expect(tileTransposed('lcd-square', 90, { width: 1280, height: 720 })).toBe(false);
    expect(tileTransposed('lcd-wide', 90, { width: 1280, height: 720 })).toBe(false);
    expect(tileTransposed('lcd-wide', 90, TALL)).toBe(true);
  });

  it('swaps from the base shape when the size is unknown', () => {
    expect(tileTransposed('lcd-wide', 90)).toBe(true);
    expect(tileTransposed('lcd-wide', 0)).toBe(false);
  });
});

describe('grid for a quarter-turn render', () => {
  it('lcd-wide: 4x2 at 0/180 as before, 2x4 at 90/270', () => {
    const before = panelGridCapacityForCanvas(WIDE.width, WIDE.height, { surface: 'lcd-wide' });
    const flat = panelGridCapacityForCanvas(WIDE.width, WIDE.height, { surface: 'lcd-wide', transposedTile: false });
    expect(flat).toEqual(before);
    expect(before).toMatchObject({ columns: 4, rows: 2 });
    expect(panelGridCapacityForCanvas(TALL.width, TALL.height, { surface: 'lcd-wide', transposedTile: true }))
      .toMatchObject({ columns: 2, rows: 4 });
  });

  it('lcd-square and lcd-round keep a 2x2 grid with or without the flag', () => {
    for (const surface of ['lcd-square', 'lcd-round'] as PanelSurface[]) {
      const base = panelGridCapacityForCanvas(720, 720, { surface });
      expect(base).toMatchObject({ columns: 2, rows: 2 });
      expect(panelGridCapacityForCanvas(720, 720, { surface, transposedTile: true })).toEqual(base);
    }
  });

  it('the Glacial (720x1280) keeps its 2x2 tile when rotated wide', () => {
    expect(panelGridCapacityForCanvas(720, 1280, { surface: 'lcd-square' })).toMatchObject({ columns: 2, rows: 2 });
    expect(panelGridCapacityForCanvas(1280, 720, { surface: 'lcd-square' })).toMatchObject({ columns: 2, rows: 2 });
  });

  it('the 8.8 grid transposes with its swapped canvas at the same slot count', () => {
    const dpi = 225;
    const slots = panelShortSideSlots('monitor', 'lianli-screen88', 'large', undefined);
    expect(slots).toBe(2);
    const landscape = panelGridCapacityForCanvas(1920, 480, { surface: 'monitor', dpi, shortSideSlots: slots });
    const portrait = panelGridCapacityForCanvas(480, 1920, { surface: 'monitor', dpi, shortSideSlots: slots });
    expect(landscape).toMatchObject({ columns: 8, rows: 2 });
    expect(portrait).toMatchObject({ columns: 2, rows: 8 });
  });

  it('a family grid option (HydroShift small) transposes with its canvas', () => {
    const slots = panelShortSideSlots('lcd-wide', 'lianli-hydroshift2-curve', 'small', 4);
    const wide = panelGridCapacityForCanvas(2288, 1080, { surface: 'monitor', dpi: 379, shortSideSlots: slots });
    const tall = panelGridCapacityForCanvas(1080, 2288, { surface: 'monitor', dpi: 379, shortSideSlots: slots });
    expect({ columns: tall.columns, rows: tall.rows }).toEqual({ columns: wide.rows, rows: wide.columns });
  });
});

describe('layout normalisation per slot', () => {
  const layout = (surface: PanelSurface, size: string): PanelLayout => ({
    layoutSchemaVersion: 2,
    surface,
    pages: [{ id: 'p', widgets: [{ id: 'w', type: 'clock', size: size as never, col: 0, row: 0 }] }],
  });

  it('snaps a tall tile to the wide one at 0/180, so existing layouts are unchanged', () => {
    const out = normalizePanelLayout(layout('lcd-wide', '4x2'), 'lcd-wide');
    const same = normalizePanelLayout(layout('lcd-wide', '4x2'), 'lcd-wide', undefined, undefined, false, false);
    expect(same).toEqual(out);
    expect(out.pages[0].widgets[0].size).toBe('4x2');
  });

  it('gives an empty portrait slot a tall tile (the default path)', () => {
    // The default layout seeds from the tall q60 tile, which the portrait slot keeps.
    const out = normalizePanelLayout(layout('lcd-wide', '2x4'), 'lcd-wide', undefined, undefined, false, true);
    expect(out.pages[0].widgets[0].size).toBe('2x4');
    const fromWide = normalizePanelLayout(layout('lcd-wide', '4x2'), 'lcd-wide', undefined, undefined, false, true);
    expect(fromWide.pages[0].widgets[0].size).toBe('2x4');
  });
});

describe('record canvas', () => {
  const caps = { cssWidth: 1280, cssHeight: 480, dpr: 1 };
  it('prefers the service render size', () => {
    expect(recordCanvasOf({ capabilities: caps, renderWidth: 480, renderHeight: 1280 })).toEqual({ width: 480, height: 1280, dpr: 1 });
  });
  it('falls back to the capability size without it', () => {
    expect(recordCanvasOf({ capabilities: caps })).toEqual({ width: 1280, height: 480, dpr: 1 });
    expect(recordCanvasOf({ capabilities: caps, renderWidth: null, renderHeight: null })).toEqual({ width: 1280, height: 480, dpr: 1 });
  });
});
