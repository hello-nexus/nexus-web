// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nearestWidgetSizeStop, widgetSizeStops } from './widgetSizeStops';
import { panelWidgetSizeOptions, type PanelSurface } from '../types';

const stopsOf = (surface: PanelSurface, family?: string) => widgetSizeStops(panelWidgetSizeOptions(surface, family)!).map(s => `${s.mode}:${s.percent}`);

describe('widgetSizeStops', () => {
  it('labels the Y70 and plain displays 100 / 75 / 50', () => {
    expect(stopsOf('y70')).toEqual(['large:100', 'small:75', 'xsmall:50']);
    expect(stopsOf('monitor')).toEqual(['small:100', 'medium:75', 'xsmall:50']);
  });

  it('gives device screens two stops, 100 and 50', () => {
    expect(stopsOf('q60')).toEqual(['large:100', 'small:50']);
    expect(stopsOf('lcd-square', 'asus-glacial-lcd')).toEqual(['large:100', 'small:50']);
    expect(stopsOf('lcd-wide', 'lianli-hydroshift2-curve')).toEqual(['large:100', 'small:50']);
    expect(stopsOf('monitor', 'icue-link-lcd5')).toEqual(['small:100', 'xsmall:50']);
    expect(stopsOf('monitor', 'lianli-screen88')).toEqual(['small:100', 'xsmall:50']);
    expect(stopsOf('monitor', 'hyte-y60')).toEqual(['small:100', 'xsmall:50']);
  });

  it('only ever shows 25, 50, 75 or 100, and every surface has a 100 baseline', () => {
    const panels: Array<[PanelSurface, string | undefined]> = [
      ['y70', undefined], ['q60', undefined], ['monitor', undefined], ['monitor', 'icue-link-lcd5'], ['monitor', 'lianli-screen88'],
      ['monitor', 'hyte-y60'], ['lcd-square', 'asus-glacial-lcd'], ['lcd-wide', 'lianli-hydroshift2-curve'],
    ];
    for (const [surface, family] of panels) {
      const options = panelWidgetSizeOptions(surface, family)!;
      const percents = widgetSizeStops(options).map(s => s.percent);
      expect(percents.length).toBeGreaterThan(1);
      for (const p of percents) expect([25, 50, 75, 100]).toContain(p);
      expect(percents).toContain(100);
      // The default size is the 100% baseline, or a tile Large that is.
      expect(options.percentLabels?.[options.default]).toBe(100);
    }
  });

  it('snaps a typed percent to the nearest stop and ties to the larger', () => {
    const stops = [{ mode: 'large', percent: 100 }, { mode: 'small', percent: 75 }, { mode: 'xsmall', percent: 50 }] as const;
    expect(nearestWidgetSizeStop(stops, 90)?.mode).toBe('large');
    expect(nearestWidgetSizeStop(stops, 80)?.mode).toBe('small');
    expect(nearestWidgetSizeStop(stops, 62.5)?.mode).toBe('small');
    expect(nearestWidgetSizeStop(stops, 5)?.mode).toBe('xsmall');
  });
});
