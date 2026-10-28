// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { densityShortSideSlots, DEFAULT_SURFACE_DPI } from './panelGrid';
import { panelGridCapacityForCanvas } from './grid';
import { PANEL_WIDGET_SIZE_MODES, panelWidgetSizeOptions, panelShortSideSlots, panelLayoutSurface, type PanelSurface } from '../types';

// A column count is never odd, on any surface, size, canvas or orientation.
const PANELS: Array<[PanelSurface, string | undefined]> = [
  ['y70', undefined], ['q60', undefined], ['phone', undefined], ['desktop', undefined],
  ['monitor', undefined], ['monitor', 'icue-link-lcd5'], ['monitor', 'lianli-screen88'], ['monitor', 'hyte-y60'],
  ['lcd-square', 'asus-glacial-lcd'], ['lcd-wide', 'lianli-hydroshift2-curve'], ['lcd-round', undefined],
];
const CANVASES: Array<[string, number, number]> = [
  ['1080p', 1920, 1080], ['1440p', 2560, 1440], ['4K', 3840, 2160], ['ultrawide', 5120, 1440], ['super-ultrawide', 7680, 2160],
  ['1080p portrait', 1080, 1920], ['1440p portrait', 1440, 2560], ['4K portrait', 2160, 3840], ['Y70', 682, 2560], ['Y70 landscape', 2560, 682],
  ['Q60', 720, 1280], ['Glacial', 480, 480], ['8.8 bar', 480, 1920], ['8.8 bar landscape', 1920, 480],
];

describe('even column counts', () => {
  for (const [surface, family] of PANELS) {
    it(`${surface}${family ? ` (${family})` : ''} has only even counts at every size and canvas`, () => {
      const options = panelWidgetSizeOptions(surface, family);
      const sizes: Array<string | undefined> = options ? PANEL_WIDGET_SIZE_MODES.filter(m => options.layoutSurface[m]) : [undefined];
      const odd: string[] = [];
      for (const size of sizes) {
        for (const [name, w, h] of CANVASES) {
          for (const dpr of [1, 1.5, 2]) {
            const dpi = options?.dpi ?? DEFAULT_SURFACE_DPI[surface];
            const density = densityShortSideSlots(w, h, dpr, dpi);
            const layout = panelLayoutSurface(surface, family, size);
            const forced = panelShortSideSlots(surface, family, size, density);
            const cap = panelGridCapacityForCanvas(Math.round(w * dpr), Math.round(h * dpr), { surface: layout, dpi, shortSideSlots: forced, paddingRatio: 0.1 });
            for (const [label, n] of [['density', density], ['forced', forced], ['columns', cap.columns], ['rows', cap.rows]] as const) {
              if (n !== undefined && n % 2 !== 0) odd.push(`${size ?? 'default'} ${name}@${dpr} ${label}=${n}`);
            }
          }
        }
      }
      expect(odd).toEqual([]);
    });
  }
});
