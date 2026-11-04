// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SIMULATED_SCREEN_CATALOG } from '../../lib/simulatedScreenCatalog';
import { panelGridCapacityForCanvas, panelWidgetPaddingRatio, PANEL_WIDGET_PADDING_DEFAULT_PERCENT } from './grid';
import { widgetSizeCapacity } from './widgetSizeFit';
import { widgetSizeStops, stopForWidgetSize } from './widgetSizeStops';
import { panelShortSideSlots, panelWidgetSizeOptions, resolvePanelWidgetSize, widgetSizeShortSideSlots } from '../types';
import { ZMATRICES_LCD_FAMILY, ZMATRICES_MAX_E87_FAMILY } from '../types';

const E87 = SIMULATED_SCREEN_CATALOG.find(s => s.id === 'zmatrices-max-e87')!;
const OPTIONS = panelWidgetSizeOptions('lcd-wide', ZMATRICES_MAX_E87_FAMILY)!;
const PADDING = panelWidgetPaddingRatio(PANEL_WIDGET_PADDING_DEFAULT_PERCENT);
const capacityOf = (mode: 'large' | 'medium' | 'small') => {
  const target = OPTIONS.layoutSurface[mode]!;
  return widgetSizeCapacity(target, { width: E87.width, height: E87.height }, 1, E87.dpi, PADDING, widgetSizeShortSideSlots(OPTIONS, mode, undefined))!;
};

describe('ZMatrices MAX E87 widget scale', () => {
  it('offers 100 / 75 / 50 with the tile as the default', () => {
    expect(OPTIONS.default).toBe('large');
    expect(widgetSizeStops(OPTIONS).map(s => `${s.mode}:${s.percent}`)).toEqual(['large:100', 'medium:75', 'small:50']);
    expect(widgetSizeStops(OPTIONS, 4).map(s => s.percent)).toEqual([100, 75, 50]);
  });

  it('lays the 75% stop out as exactly 8 columns x 3 rows at 1280x480', () => {
    expect(widgetSizeShortSideSlots(OPTIONS, 'medium', undefined)).toBe(3);
    expect(capacityOf('medium')).toEqual({ gridCols: 8, pageRows: 3 });
    const raw = panelGridCapacityForCanvas(E87.width, E87.height, { surface: 'monitor', dpi: E87.dpi, paddingRatio: PADDING, shortSideSlots: 3 });
    expect([raw.columns, raw.rows]).toEqual([8, 3]);
  });

  it('keeps the 50% density grid denser than 75% and does not force a count on it', () => {
    expect(widgetSizeShortSideSlots(OPTIONS, 'small', undefined)).toBeUndefined();
    const small = capacityOf('small');
    expect(small.pageRows).toBeGreaterThan(3);
    expect(small.gridCols).toBeGreaterThan(8);
  });

  it('round-trips a stored medium, and keeps an unoffered size on the default', () => {
    const resolve = (v: string | undefined) => resolvePanelWidgetSize('lcd-wide', ZMATRICES_MAX_E87_FAMILY, v);
    expect(['large', 'medium', 'small', undefined, 'xsmall', 'compact'].map(resolve)).toEqual(['large', 'medium', 'small', 'large', 'large', 'large']);
    expect(panelShortSideSlots('lcd-wide', ZMATRICES_MAX_E87_FAMILY, 'medium', 4)).toBe(3);
    const stops = widgetSizeStops(OPTIONS, 4);
    expect(stopForWidgetSize(OPTIONS, stops, 'medium', 4)?.percent).toBe(75);
  });

  it('leaves the Glacier Matrix at 100 / 50', () => {
    const glacier = panelWidgetSizeOptions('lcd-wide', ZMATRICES_LCD_FAMILY)!;
    expect(widgetSizeStops(glacier).map(s => `${s.mode}:${s.percent}`)).toEqual(['large:100', 'small:50']);
    expect(glacier.layoutSurface.medium).toBeUndefined();
    expect(glacier.shortSideSlots).toBeUndefined();
  });

  it('keeps a forced three on the short side in portrait too, with the rows derived', () => {
    const portrait = panelGridCapacityForCanvas(E87.height, E87.width, { surface: 'monitor', dpi: E87.dpi, paddingRatio: PADDING, shortSideSlots: 3 });
    expect(portrait.columns).toBe(3);
    expect(portrait.rows).toBeGreaterThanOrEqual(8);
    expect(portrait.rows % 2).toBe(0);
    const viaSize = widgetSizeCapacity('monitor', { width: E87.height, height: E87.width }, 1, E87.dpi, PADDING, 3)!;
    expect(viaSize.gridCols).toBe(3);
  });

  it('still rounds a density-derived or even forced count to even', () => {
    const grid = panelGridCapacityForCanvas(E87.width, E87.height, { surface: 'monitor', dpi: E87.dpi, paddingRatio: PADDING });
    expect(grid.rows % 2).toBe(0);
    expect(grid.columns % 2).toBe(0);
    const forced = panelGridCapacityForCanvas(E87.width, E87.height, { surface: 'monitor', dpi: E87.dpi, paddingRatio: PADDING, shortSideSlots: 4 });
    expect(forced.rows).toBe(4);
  });

  it('gives the Glacier Matrix the density grid for its small size and no forced count', () => {
    const glacier = panelWidgetSizeOptions('lcd-wide', ZMATRICES_LCD_FAMILY)!;
    expect(widgetSizeShortSideSlots(glacier, 'small', undefined)).toBeUndefined();
    const cap = widgetSizeCapacity('monitor', { width: E87.width, height: E87.height }, 1, 109, PADDING, undefined)!;
    expect(cap.gridCols % 2).toBe(0);
    expect(cap.pageRows % 2).toBe(0);
  });
});
