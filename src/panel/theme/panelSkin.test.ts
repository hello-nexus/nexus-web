import { describe, it, expect } from 'vitest';
import { applyPanelSkin, normalizeStoredSkin, panelFontAttrs, panelSkinAttrs, panelSkinScopeAttrs, panelSkinVars, resolveSkin } from './panelSkin';
import { buildPanelTheme, buildPanelThemeVars, resolveEffectivePanelTheme } from './panelTheme';
import type { PanelDeviceRecord } from '../../api/panel';

const record = (over: Partial<PanelDeviceRecord> = {}): PanelDeviceRecord => ({
  id: 'dev1', displayName: 'Y70', firstSeenAt: 0, lastSeenAt: 0, capabilities: { surface: 'y70' }, ...over,
} as PanelDeviceRecord);

describe('panel skin normalization', () => {
  it('reads an unknown skin as none', () => {
    expect(normalizeStoredSkin('nope')).toBeNull();
    expect(normalizeStoredSkin(null)).toBeNull();
    expect(normalizeStoredSkin('lcd')).toBe('lcd');
    expect(normalizeStoredSkin('eink')).toBeNull();
    expect(buildPanelTheme(null, record({ skin: 'eink', skinOverrides: { eink: { accent: '#123456' } } }))).toMatchObject({ skin: null, skinOverrides: {} });
  });

  it('builds the skin from the device record', () => {
    const theme = buildPanelTheme(null, record({ skin: 'lcd' }));
    expect(theme.skin).toBe('lcd');
    expect(buildPanelTheme(null, record({ skin: 'x' })).skin).toBeNull();
  });
});

describe('panel skin render-time overrides', () => {
  it('leaves the stored theme alone, and the effective mode follows the Theme controls', () => {
    const base = buildPanelTheme(null, record({ skin: 'crt', font: 'oswald', themeMode: 'light', themeSyncWithDesktop: false }));
    const eff = resolveEffectivePanelTheme(base, 'y70');
    expect(eff.themeMode).toBe('light');
    expect(eff.themeSyncWithDesktop).toBe(false);
    expect(base.themeMode).toBe('light');
    expect(base.font).toBe('oswald');
  });

  it('uses the skin font by default and a skin-level font override on every skin', () => {
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'lcd', skinOverrides: { lcd: { font: 'oswald' } } })))?.font).toBe('oswald');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'pixel', skinOverrides: { pixel: { font: 'lexend' } } })))?.font).toBe('lexend');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud', skinOverrides: { hud: { font: 'oswald' } } })))?.font).toBe('oswald');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud', font: 'oswald' })))?.font).toBe('tektur');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud' })))?.font).toBe('tektur');
  });

  it('flags a skin font that differs from the skin default', () => {
    const attrs = (r: Partial<PanelDeviceRecord>) => panelSkinAttrs(buildPanelTheme(null, record({ skin: 'lcd', ...r })));
    expect(attrs({})).not.toHaveProperty('data-skin-font-custom');
    expect(attrs({ skinOverrides: { lcd: { font: 'jura' } } })).not.toHaveProperty('data-skin-font-custom');
    expect(attrs({ skinOverrides: { lcd: { font: 'oswald' } } })).toHaveProperty('data-skin-font-custom');
  });

  it('keeps Lexend as an explicit skin font choice', () => {
    const picked = buildPanelTheme(null, record({ skin: 'hud', skinOverrides: { hud: { font: 'lexend' } } }));
    expect(picked.skinOverrides.hud?.font).toBe('lexend');
    expect(resolveSkin(picked)?.font).toBe('lexend');
  });

  it('draws the resolved skin font even when it is Lexend, over the user font', () => {
    const theme = buildPanelTheme(null, record({ skin: 'glass', font: 'oswald' }));
    expect(resolveSkin(theme)?.font).toBe('lexend');
    const vars = panelSkinVars(theme, '#ffffff');
    expect(vars['--panel-font']).toContain("'Lexend'");
    expect(vars['--font-sans']).toBe(vars['--panel-font']);
  });

  it('applies the skin accent, ignoring the user accent; a skin-level override wins', () => {
    const own = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud', accentSyncWithDesktop: false, accentColor: '#ff0000' })));
    expect(own.accentColor).toBe('#2fd8ff');
    const override = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud', skinOverrides: { hud: { accent: '#00ff00' } } })));
    expect(override.accentColor).toBe('#00ff00');
    const steam = applyPanelSkin(buildPanelTheme(null, record({ skin: 'steampunk', skinOverrides: { steampunk: { accent: '#ff0000' } } })));
    expect(steam.accentColor).toBe('#ff0000');
    const lcd = applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', skinOverrides: { lcd: { accent: '#ff0000' } } })));
    expect(lcd.accentColor).toBe('#ff0000');
  });

  it('leaves the mode to the Theme controls', () => {
    const own = record({ skin: 'lcd', themeSyncWithDesktop: false, themeMode: 'dark' });
    expect(applyPanelSkin(buildPanelTheme(null, own)).themeMode).toBe('dark');
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', themeSyncWithDesktop: true }))).themeSyncWithDesktop).toBe(true);
    const crt = applyPanelSkin(buildPanelTheme(null, record({ skin: 'crt', themeSyncWithDesktop: false, themeMode: 'light' })));
    expect(crt.themeMode).toBe('light');
  });

  it('resolves the same mode and accent for the editor preview as for the panel', () => {
    // The editor derives its simulator mode from applyPanelSkin, like PanelApp does.
    for (const id of ['lcd', 'hud', 'steampunk', 'crt'] as const) {
      const t = buildPanelTheme(null, record({ skin: id, themeSyncWithDesktop: false, themeMode: 'light' }));
      const viaEditor = applyPanelSkin(t);
      const viaPanel = resolveEffectivePanelTheme(t, 'y70');
      expect(viaEditor.themeMode).toBe(viaPanel.themeMode);
      expect(viaEditor.accentColor).toBe(viaPanel.accentColor);
    }
  });

  it('is a no-op without a skin', () => {
    const base = buildPanelTheme(null, record());
    expect(applyPanelSkin(base)).toBe(base);
    expect(panelSkinAttrs(base)).toEqual({});
    expect(panelSkinVars(base, '#ffffff')).toEqual({});
  });

  it('stamps the skin attribute and the font and accent vars', () => {
    const eff = resolveEffectivePanelTheme(buildPanelTheme(null, record({ skin: 'lcd' })), 'y70');
    expect(panelSkinAttrs(eff)).toMatchObject({ 'data-panel-skin': 'lcd' });
    const pixel = resolveEffectivePanelTheme(buildPanelTheme(null, record({ skin: 'pixel' })), 'y70');
    const vars = buildPanelThemeVars(pixel, 'dark') as Record<string, string>;
    expect(vars['--panel-font']).toContain("'Pixel'");
    expect(vars['--skin-accent']).toBeTruthy();
  });
});

describe('panel font attribute', () => {
  it('names the embedded font the panel draws in, skin font included', () => {
    expect(panelFontAttrs(buildPanelTheme(null, record({ font: 'oswald' })))).toEqual({ 'data-panel-font': 'oswald' });
    expect(panelFontAttrs(buildPanelTheme(null, record({ skin: 'neon' })))).toEqual({ 'data-panel-font': 'oswald' });
    expect(panelFontAttrs(buildPanelTheme(null, record({ skin: 'neon', skinOverrides: { neon: { font: 'lexend' } } })))).toEqual({ 'data-panel-font': 'lexend' });
    expect(panelFontAttrs(buildPanelTheme(null, record({ font: 'oswald', skin: 'hud' })))).toEqual({ 'data-panel-font': 'tektur' });
  });

  it('is absent for the app font and for a system font', () => {
    expect(panelFontAttrs(buildPanelTheme(null, record()))).toEqual({});
    expect(panelFontAttrs(buildPanelTheme(null, record({ font: 'system:Arial' })))).toEqual({});
  });
});

describe('panel skin scope attributes for a preview outside the panel', () => {
  it('carries the skin and its own font while the skin keeps its font', () => {
    const theme = buildPanelTheme(null, record({ skin: 'lcd', font: 'oswald' }));
    expect(panelSkinScopeAttrs(theme)).toMatchObject({ 'data-panel-skin': 'lcd', 'data-panel-font': 'jura' });
    expect(panelSkinScopeAttrs(theme)).not.toHaveProperty('data-skin-font-custom');
  });

  it('follows the per-skin font pick and marks it custom', () => {
    const theme = buildPanelTheme(null, record({ skin: 'lcd', skinOverrides: { lcd: { font: 'oswald' } } }));
    expect(panelSkinScopeAttrs(theme)).toMatchObject({ 'data-panel-skin': 'lcd', 'data-panel-font': 'oswald', 'data-skin-font-custom': '' });
  });

  it('is null with no skin, leaving the selected font to the theme vars', () => {
    const theme = buildPanelTheme(null, record({ font: 'oswald' }));
    expect(panelSkinScopeAttrs(theme)).toBeNull();
    expect(buildPanelThemeVars(theme, 'dark')['--panel-font' as keyof ReturnType<typeof buildPanelThemeVars>]).toContain('Oswald');
  });
});
