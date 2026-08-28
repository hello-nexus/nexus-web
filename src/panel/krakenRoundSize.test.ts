import { describe, expect, it } from 'vitest';
import {
  PANEL_WIDGET_SIZES,
  SINGLE_WIDGET_SIZES,
  isSingleWidgetSurface,
  normalizePanelWidgetSizeForSurface,
  singleWidgetSurfaceSize,
  surfaceSupportsTextInput,
  surfaceSupportsTouch,
} from './types';
import { sizeToSpan } from './engine/grid';
import { sizesForSurface } from './widgets/registry';
import { clockApp } from './widgets/clock';
import { monitoringApp } from './widgets/monitoring';

describe('kraken round widget size', () => {
  it('is a real size occupying a 2x2 block', () => {
    expect(PANEL_WIDGET_SIZES).toContain('2x2round');
    expect(sizeToSpan('2x2round')).toEqual({ cols: 2, rows: 2 });
  });

  it('is the kraken surface fixed size, and the kraken is single-widget', () => {
    expect(singleWidgetSurfaceSize('kraken')).toBe('2x2round');
    expect(isSingleWidgetSurface('kraken')).toBe(true);
  });

  it('is reserved to single-widget surfaces so other panels never offer it', () => {
    expect(SINGLE_WIDGET_SIZES.has('2x2round')).toBe(true);
    for (const surface of ['desktop', 'y70', 'phone'] as const) {
      expect(sizesForSurface(clockApp.meta, surface)).not.toContain('2x2round');
    }
  });

  it('offers clock and monitoring on the kraken, collapsed to the round size', () => {
    expect(sizesForSurface(clockApp.meta, 'kraken')).toEqual(['2x2round']);
    expect(sizesForSurface(monitoringApp.meta, 'kraken')).toEqual(['2x2round']);
  });

  it('snaps any persisted size to the round one on the kraken', () => {
    for (const size of ['1x1', '4x4', '2x4', 'nonsense']) {
      expect(normalizePanelWidgetSizeForSurface(size, 'kraken')).toBe('2x2round');
    }
  });

  it('treats the glass as display-only', () => {
    // The cooler exposes no input path at all: HID control plus a bulk OUT pipe.
    expect(surfaceSupportsTouch('kraken')).toBe(false);
    expect(surfaceSupportsTextInput('kraken')).toBe(false);
  });
});
