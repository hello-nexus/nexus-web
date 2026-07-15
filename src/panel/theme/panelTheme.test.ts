import { describe, expect, it } from 'vitest';
import { resolveEffectivePanelTheme } from './panelTheme';
import type { PanelThemeState } from './panelTheme';

const baseTheme: PanelThemeState = {
  appThemeMode: 'system',
  appResolvedThemeMode: '',
  themeSyncWithDesktop: true,
  themeMode: 'system',
  appAccentColor: '#7dd3fc',
  accentSyncWithDesktop: true,
  accentColor: '',
  backgroundColor: '',
  backgroundColorLight: '',
  backgroundMode: 'solid',
  backgroundEffect: 'plasma',
  backgroundTemplate: 0,
  backgroundTemplates: {},
  backgroundOpacity: 1,
  backgroundEffectState: { speed: 0, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} },
  backgroundMediaId: null,
  backgroundMediaType: null,
  widgetOpacity: 1,
  widgetLabels: true,
  widgetBlur: true,
  widgetPadding: 50,
};

describe('resolveEffectivePanelTheme', () => {
  it('leaves multi-widget surfaces (y70, q60 aside) untouched', () => {
    expect(resolveEffectivePanelTheme(baseTheme, 'y70')).toBe(baseTheme);
    expect(resolveEffectivePanelTheme(baseTheme, 'phone')).toBe(baseTheme);
    expect(resolveEffectivePanelTheme(baseTheme, 'monitor')).toBe(baseTheme);
  });

  it('forces labels/blur/opacity off and padding to 0 on single-widget surfaces (q60)', () => {
    const effective = resolveEffectivePanelTheme(baseTheme, 'q60');
    expect(effective.widgetLabels).toBe(false);
    expect(effective.widgetBlur).toBe(false);
    expect(effective.widgetOpacity).toBe(0);
    expect(effective.widgetPadding).toBe(0);
    // Only the forced fields change; everything else carries through.
    expect(effective.backgroundEffect).toBe(baseTheme.backgroundEffect);
  });

  it('forces widgetPadding to 100 (the slider max) on the embedded desktop dashboard, leaving other fields untouched', () => {
    const effective = resolveEffectivePanelTheme(baseTheme, 'desktop');
    expect(effective.widgetPadding).toBe(100);
    expect(effective.widgetLabels).toBe(baseTheme.widgetLabels);
    expect(effective.widgetBlur).toBe(baseTheme.widgetBlur);
    expect(effective.widgetOpacity).toBe(baseTheme.widgetOpacity);
  });
});
