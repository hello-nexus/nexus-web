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

const LCD_SURFACES: PanelSurface[] = ['lcd-round', 'lcd-square'];

describe('cooler LCD surfaces', () => {
  it('are single-widget surfaces with a size that exists', () => {
    for (const surface of LCD_SURFACES) {
      expect(isSingleWidgetSurface(surface)).toBe(true);
      const size = singleWidgetSurfaceSize(surface);
      expect(size).toBeDefined();
      expect(PANEL_WIDGET_SIZES).toContain(size!);
    }
  });

  it('round glass takes the circular tile and square glass a plain 2x2', () => {
    expect(singleWidgetSurfaceSize('lcd-round')).toBe('2x2round');
    expect(singleWidgetSurfaceSize('lcd-square')).toBe('2x2');
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
