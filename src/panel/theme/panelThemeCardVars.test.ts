// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultPanelWidgetOpacity } from '../background/panelBackground';
import { buildPanelThemeVars, type PanelThemeState } from './panelTheme';

const themeWith = (widgetOpacity: number | undefined) => ({ widgetOpacity, font: null } as unknown as PanelThemeState);
const vars = (opacity: number | undefined, mode: 'dark' | 'light') => buildPanelThemeVars(themeWith(opacity), mode) as Record<string, string>;

describe('widget opacity card vars', () => {
  for (const mode of ['dark', 'light'] as const) {
    it(`fills from the opaque surface and follows the slider in the ${mode} theme`, () => {
      for (const [opacity, pct] of [[1, '100%'], [0.5, '50%'], [0, '0%']] as const) {
        const v = vars(opacity, mode);
        // The opaque variant makes 100% a solid card; the translucent --surface would cap it.
        expect(v['--panel-card-fill']).toBe('var(--panel-card-fill-opaque)');
        expect(v['--panel-card-bg-opacity']).toBe(pct);
        expect(v['--panel-card-bg-alpha']).toBe(String(opacity));
      }
    });
  }

  it('defaults a panel with no stored value to a solid card', () => {
    expect(defaultPanelWidgetOpacity()).toBe(1);
    expect(vars(undefined, 'dark')['--panel-card-bg-opacity']).toBe('100%');
  });

  it('keeps an explicit stored value', () => {
    expect(vars(0.7, 'light')['--panel-card-bg-opacity']).toBe('70%');
  });

  it('defines the opaque fill for both themes in the stylesheet', () => {
    const css = readFileSync(new URL('../styles/tokens.scss', import.meta.url), 'utf8');
    const light = css.indexOf(".panel-root[data-theme='light']");
    expect(css.slice(0, light)).toMatch(/--panel-card-fill-opaque:/);
    expect(css.slice(light)).toMatch(/--panel-card-fill-opaque:/);
  });
});
