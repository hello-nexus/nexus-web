import { describe, it, expect } from 'vitest';
import {
  PANEL_WIDGET_SIZES,
  SINGLE_WIDGET_SIZES,
  isSingleWidgetSurface,
  singleWidgetSurfaceSize,
  surfaceSupportsTouch,
  widgetLayoutSize,
  type PanelSurface,
} from './types';
import { DEFAULT_SURFACE_DPI } from './engine/panelGrid';
import { panelGridCapacityForCanvas } from './engine/grid';

const LCD_SURFACES: PanelSurface[] = ['lcd-round', 'lcd-square', 'lcd-wide'];

describe('cooler LCD surfaces', () => {
  it('are single-widget surfaces with a size that exists', () => {
    for (const surface of LCD_SURFACES) {
      expect(isSingleWidgetSurface(surface)).toBe(true);
      const size = singleWidgetSurfaceSize(surface);
      expect(size).toBeDefined();
      expect(PANEL_WIDGET_SIZES).toContain(size!);
    }
  });

  it('round glass takes the circular tile, square a 2x2 and wide glass a 4x2', () => {
    expect(singleWidgetSurfaceSize('lcd-round')).toBe('2x2round');
    expect(singleWidgetSurfaceSize('lcd-square')).toBe('2x2');
    expect(singleWidgetSurfaceSize('lcd-wide')).toBe('4x2');
  });

  it('accept no pointer input - they are framebuffers on a USB pipe', () => {
    for (const surface of LCD_SURFACES) {
      expect(surfaceSupportsTouch(surface)).toBe(false);
    }
  });

  it('carry a DPI estimate so the grid can scale text', () => {
    for (const surface of LCD_SURFACES) {
      expect(DEFAULT_SURFACE_DPI[surface]).toBeGreaterThan(0);
    }
  });

  /**
   * Regression guard. SINGLE_WIDGET_SIZES is derived from the per-surface size map, and
   * adding 'lcd-square' -> '2x2' briefly pulled '2x2' into it. That reserved an ordinary
   * size: multi-widget surfaces hide reserved sizes from the picker and snap persisted
   * widgets off them, so eight layout tests broke at once, none of them near this file.
   */
  it('never reserve a size that multi-widget surfaces use', () => {
    expect(SINGLE_WIDGET_SIZES.has('2x2')).toBe(false);
    expect(SINGLE_WIDGET_SIZES.has('4x2')).toBe(false);
    expect(SINGLE_WIDGET_SIZES.has('4x4')).toBe(false);
    expect(SINGLE_WIDGET_SIZES.has('1x1')).toBe(false);
    // Still reserved: the Q60's strip and the round tile.
    expect(SINGLE_WIDGET_SIZES.has('2x4')).toBe(true);
    expect(SINGLE_WIDGET_SIZES.has('2x2round')).toBe(true);
  });

  it('lay the round tile out as the 2x2 square inscribed in the circle', () => {
    expect(widgetLayoutSize('2x2round')).toBe('2x2');
  });
});

/**
 * The wide tile must fit the glass on BOTH axes. The 2x2 span put a square content
 * box on a 2.22:1 panel and spilled 65% of the widget below the card, which is what
 * the customer photographed; the 4x2 span brings the mismatch down to the same mild
 * squash the Q60 already ships with, and the per-axis .cellScaler override absorbs it.
 */
describe('wide cooler glass lays its tile out landscape', () => {
  it('is a 4x2 grid that fits inside a 1600x720 panel', () => {
    const cap = panelGridCapacityForCanvas(1600, 720, { surface: 'lcd-wide', gap: 0, padding: 0 });

    expect(cap.columns).toBe(4);
    expect(cap.rows).toBe(2);
    expect(cap.columns * cap.cellSize).toBeLessThanOrEqual(1600);
    expect(cap.rows * cap.rowSize).toBeLessThanOrEqual(720);
  });

  it('keeps cells squarer than the 2x2 span did on the same glass', () => {
    const wide = panelGridCapacityForCanvas(1600, 720, { surface: 'lcd-wide', gap: 0, padding: 0 });
    const square = panelGridCapacityForCanvas(1600, 720, { surface: 'lcd-square', gap: 0, padding: 0 });

    expect(wide.cellSize / wide.rowSize).toBeLessThan(square.cellSize / square.rowSize);
  });
});
