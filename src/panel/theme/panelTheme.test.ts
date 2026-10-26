// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildOverlayCardVars, resolveEffectivePanelTheme } from './panelTheme';
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
  backgroundMediaAlpha: false,
  backgroundSlideshow: false,
  backgroundSlideshowInterval: 30,
  backgroundSlideshowShuffle: false,
  backgroundSlideshowFinishVideos: true,
  backgroundMediaOrder: [],
  backgroundFrost: 100,
  immersiveBackdrop: true,
  widgetOpacity: 1,
  widgetLabels: true,
  widgetPadding: 50,
};

describe('resolveEffectivePanelTheme', () => {
  it('leaves multi-widget surfaces (y70, q60 aside) untouched', () => {
    expect(resolveEffectivePanelTheme(baseTheme, 'y70')).toBe(baseTheme);
    expect(resolveEffectivePanelTheme(baseTheme, 'phone')).toBe(baseTheme);
    expect(resolveEffectivePanelTheme(baseTheme, 'monitor')).toBe(baseTheme);
  });

  it('forces labels/opacity off and padding to 0 on single-widget surfaces (q60)', () => {
    const effective = resolveEffectivePanelTheme(baseTheme, 'q60');
    expect(effective.widgetLabels).toBe(false);
    expect(effective.widgetOpacity).toBe(0);
    expect(effective.widgetPadding).toBe(0);
    // Only the forced fields change; everything else carries through.
    expect(effective.backgroundEffect).toBe(baseTheme.backgroundEffect);
    expect(effective.backgroundFrost).toBe(baseTheme.backgroundFrost);
  });

  it('forces widgetPadding to 100 (the slider max) on the embedded desktop dashboard, leaving other fields untouched', () => {
    const effective = resolveEffectivePanelTheme(baseTheme, 'desktop');
    expect(effective.widgetPadding).toBe(100);
    expect(effective.widgetLabels).toBe(baseTheme.widgetLabels);
    expect(effective.widgetOpacity).toBe(baseTheme.widgetOpacity);
    expect(effective.backgroundFrost).toBe(baseTheme.backgroundFrost);
  });
});

describe('buildOverlayCardVars', () => {
  it('fills from the opaque surface so full opacity is a solid card', () => {
    const vars = buildOverlayCardVars(1) as Record<string, string>;
    expect(vars['--panel-card-fill']).toBe('var(--panel-card-fill-opaque)');
    expect(vars['--panel-card-bg-opacity']).toBe('100%');
  });

  it('maps lower slider values to a proportional card alpha', () => {
    const vars = buildOverlayCardVars(0.5) as Record<string, string>;
    expect(vars['--panel-card-fill']).toBe('var(--panel-card-fill-opaque)');
    expect(vars['--panel-card-bg-opacity']).toBe('50%');
  });
});
