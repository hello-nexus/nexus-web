// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nearestWidgetSizeStop, widgetSizeStops } from './widgetSizeStops';
import { DEFAULT_SURFACE_DPI } from './panelGrid';
import { panelWidgetSizeOptions } from '../types';

const dpiOf = (surface: 'y70' | 'monitor') => () => DEFAULT_SURFACE_DPI[surface];

describe('widgetSizeStops', () => {
  it('shows the Y70 stops as the real cell ratio against Large', () => {
    const options = panelWidgetSizeOptions('y70', undefined)!;
    const stops = widgetSizeStops(options, { width: 682, height: 2560 }, 1, dpiOf('y70'), 0.1, 4);
    expect(stops.map(s => s.mode)).toEqual(['large', 'small', 'xsmall']);
    expect(stops[0].percent).toBe(100);
    expect(stops[1].percent).toBeGreaterThanOrEqual(64);
    expect(stops[1].percent).toBeLessThanOrEqual(69);
    expect(stops[2].percent).toBeGreaterThanOrEqual(48);
    expect(stops[2].percent).toBeLessThanOrEqual(52);
  });

  it('computes a plain display per display, from its own density', () => {
    const options = panelWidgetSizeOptions('monitor', undefined)!;
    const hd = widgetSizeStops(options, { width: 1920, height: 1080 }, 1, dpiOf('monitor'), 0.1, 8);
    const uhd = widgetSizeStops(options, { width: 3840, height: 2160 }, 1, dpiOf('monitor'), 0.1, 16);
    expect(hd.map(s => s.mode)).toEqual(['large', 'small', 'xsmall']);
    expect(hd[1].percent).toBeLessThan(100);
    expect(hd[2].percent).toBeLessThan(hd[1].percent);
    expect(uhd[1].percent).toBeLessThan(100);
  });

  it('offers only the sizes a panel has', () => {
    const options = panelWidgetSizeOptions('monitor', 'lianli-screen88')!;
    expect(widgetSizeStops(options, { width: 1920, height: 480 }, 1, dpiOf('monitor'), 0.1, 8).map(s => s.mode)).toEqual(['large', 'small']);
  });

  it('snaps a typed percent to the nearest stop and ties to the larger', () => {
    const stops = [{ mode: 'large', percent: 100 }, { mode: 'small', percent: 60 }, { mode: 'xsmall', percent: 40 }] as const;
    expect(nearestWidgetSizeStop(stops, 90)?.mode).toBe('large');
    expect(nearestWidgetSizeStop(stops, 70)?.mode).toBe('small');
    expect(nearestWidgetSizeStop(stops, 50)?.mode).toBe('small');
    expect(nearestWidgetSizeStop(stops, 5)?.mode).toBe('xsmall');
  });
});
