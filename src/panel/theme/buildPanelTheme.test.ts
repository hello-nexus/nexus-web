import { describe, it, expect } from 'vitest';
import { buildPanelTheme, buildPanelThemeVars } from './panelTheme';
import type { PanelDeviceRecord } from '../../api/panel';
import type { Preferences } from '../../api/profiles';

const y70 = (over: Partial<PanelDeviceRecord> = {}): PanelDeviceRecord => ({
  id: 'dev1',
  displayName: 'Y70',
  firstSeenAt: 0,
  lastSeenAt: 0,
  capabilities: { surface: 'y70' },
  ...over,
} as PanelDeviceRecord);

describe('buildPanelTheme', () => {
  it('falls back to the theme backdrop with nothing to read', () => {
    const theme = buildPanelTheme(null, null);
    expect(theme.backdrop).toBe('theme');
    expect(theme.accentColor).toBe('');
  });

  it('defaults text color to adaptive for a panel that never stored one', () => {
    expect(buildPanelTheme(null, null).textColorMode).toBe('adaptive');
    expect(buildPanelTheme(null, y70()).textColorMode).toBe('adaptive');
    expect(buildPanelTheme(null, y70({ textColorMode: 'custom', textColor: '#ff8800' })).textColor).toBe('#ff8800');
  });

  it('reads a stored font and follows the app font for a missing or unknown id', () => {
    expect(buildPanelTheme(null, y70()).font).toBeNull();
    expect(buildPanelTheme(null, y70({ font: 'tektur' })).font).toBe('tektur');
    expect(buildPanelTheme(null, y70({ font: "x'; } body { color: red" })).font).toBeNull();
  });

  it('sets the panel and sans font vars only for a non-default font', () => {
    const vars = (font: string) => buildPanelThemeVars(buildPanelTheme(null, y70({ font })), 'dark') as Record<string, string>;
    expect(vars('lexend')['--panel-font']).toBeUndefined();
    expect(vars('lexend')['--font-sans']).toBeUndefined();
    expect(vars('jura')['--panel-font']).toContain("'Jura', 'Lexend'");
    expect(vars('jura')['--font-sans']).toBe(vars('jura')['--panel-font']);
  });

  it('defaults a wallpaper-capable panel with no stored choice to the wallpaper', () => {
    expect(buildPanelTheme(null, y70()).backdrop).toBe('wallpaper');
  });

  it('starts every panel with no stored background solid except the Q-series', () => {
    const on = (surface: string, over: Partial<PanelDeviceRecord> = {}) =>
      buildPanelTheme(null, { ...y70(over), capabilities: { surface } } as PanelDeviceRecord).backgroundMode;
    expect(on('q60')).toBe('shader');
    for (const surface of ['y70', 'monitor', 'phone', 'kraken', 'lcd-round', 'lcd-square', 'lcd-wide']) {
      expect(on(surface), surface).toBe('solid');
    }
    expect(on('lcd-wide', { backgroundMode: 'shader' })).toBe('shader');
    expect(on('q60', { backgroundMode: 'solid' })).toBe('solid');
  });

  it('keeps a stored backdrop', () => {
    expect(buildPanelTheme(null, y70({ backdrop: 'desktop' })).backdrop).toBe('desktop');
  });

  it('clamps a stored backdrop a surface cannot show', () => {
    const phone = { ...y70({ backdrop: 'desktop' }), capabilities: { surface: 'phone' } } as PanelDeviceRecord;
    expect(buildPanelTheme(null, phone).backdrop).toBe('theme');
  });

  it('leaves a non-theme backdrop opaque when no opacity is stored', () => {
    expect(buildPanelTheme(null, y70({ backdrop: 'desktop' })).backgroundOpacity).toBe(1);
  });

  it('defaults the media slideshow off, 30 s, in order, videos played whole', () => {
    const theme = buildPanelTheme(null, y70());
    expect(theme.backgroundSlideshow).toBe(false);
    expect(theme.backgroundSlideshowInterval).toBe(30);
    expect(theme.backgroundSlideshowShuffle).toBe(false);
    expect(theme.backgroundSlideshowFinishVideos).toBe(true);
  });

  it('reads the stored slideshow group and snaps an off-list interval to the nearest option', () => {
    const theme = buildPanelTheme(null, y70({
      backgroundMediaSlideshow: true,
      backgroundMediaInterval: 700,
      backgroundMediaShuffle: true,
      backgroundMediaFinishVideos: false,
    }));
    expect(theme.backgroundSlideshow).toBe(true);
    expect(theme.backgroundSlideshowInterval).toBe(900);
    expect(theme.backgroundSlideshowShuffle).toBe(true);
    expect(theme.backgroundSlideshowFinishVideos).toBe(false);
  });

  it('takes the sync sources from preferences', () => {
    const prefs = { theme: { themeMode: 'dark', resolvedThemeMode: 'dark', accentColor: '#ff0000' } } as Preferences;
    const theme = buildPanelTheme(prefs, y70());
    expect(theme.appThemeMode).toBe('dark');
    expect(theme.appResolvedThemeMode).toBe('dark');
    expect(theme.appAccentColor).toBe('#ff0000');
  });
});

describe('buildPanelTheme Widget size', () => {
  it('gives a Small Q-series grid card defaults and keeps its animated background', () => {
    const large = buildPanelTheme(null, y70({ capabilities: { surface: 'q60' } }));
    const small = buildPanelTheme(null, y70({ capabilities: { surface: 'q60' }, widgetSize: 'small' }));

    expect(large.widgetOpacity).toBe(0);
    expect(small.widgetOpacity).toBe(buildPanelTheme(null, y70()).widgetOpacity);
    expect(small.widgetPadding).toBe(buildPanelTheme(null, y70()).widgetPadding);
    expect(small.backgroundMode).toBe('shader');
  });
});
