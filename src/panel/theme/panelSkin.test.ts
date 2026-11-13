import { describe, it, expect } from 'vitest';
import { applyPanelSkin, normalizeStoredSkin, panelSkinAttrs, panelSkinVars, resolveSkin } from './panelSkin';
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
  });

  it('builds the skin from the device record', () => {
    const theme = buildPanelTheme(null, record({ skin: 'lcd' }));
    expect(theme.skin).toBe('lcd');
    expect(buildPanelTheme(null, record({ skin: 'x' })).skin).toBeNull();
  });
});

describe('panel skin render-time overrides', () => {
  it('leaves the stored theme alone and pins a locked mode on the effective theme', () => {
    const base = buildPanelTheme(null, record({ skin: 'crt', font: 'oswald', themeMode: 'light', themeSyncWithDesktop: false }));
    const eff = resolveEffectivePanelTheme(base, 'y70');
    expect(eff.themeMode).toBe('dark');
    expect(eff.themeSyncWithDesktop).toBe(false);
    expect(base.themeMode).toBe('light');
    expect(base.font).toBe('oswald');
  });

  it('uses the skin font by default and a skin-level font override only when the skin allows it', () => {
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'lcd', skinFont: 'oswald' })))?.font).toBe('jura');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud', skinFont: 'oswald' })))?.font).toBe('oswald');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud', font: 'oswald' })))?.font).toBe('tektur');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud' })))?.font).toBe('tektur');
  });

  it('applies the skin accent, ignoring the user accent; a skin-level override wins unless locked', () => {
    const own = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud', accentSyncWithDesktop: false, accentColor: '#ff0000' })));
    expect(own.accentColor).toBe('#2fd8ff');
    const override = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud', skinAccent: '#00ff00' })));
    expect(override.accentColor).toBe('#00ff00');
    const locked = applyPanelSkin(buildPanelTheme(null, record({ skin: 'steampunk', skinAccent: '#ff0000' })));
    expect(locked.accentColor).toBe('#ffb84a');
    const lcd = applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', skinAccent: '#ff0000' })));
    expect(lcd.accentColor).toBe('#9bb36a');
  });

  it('leaves the mode to the Theme controls, except where the skin locks it', () => {
    const own = record({ skin: 'lcd', themeSyncWithDesktop: false, themeMode: 'dark' });
    expect(applyPanelSkin(buildPanelTheme(null, own)).themeMode).toBe('dark');
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', themeSyncWithDesktop: true }))).themeSyncWithDesktop).toBe(true);
    const locked = applyPanelSkin(buildPanelTheme(null, record({ skin: 'crt', themeSyncWithDesktop: true, themeMode: 'light' })));
    expect(locked.themeMode).toBe('dark');
    expect(locked.themeSyncWithDesktop).toBe(false);
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
    const crt = applyPanelSkin(buildPanelTheme(null, record({ skin: 'crt', themeSyncWithDesktop: false, themeMode: 'light' })));
    expect(crt.themeMode).toBe('dark');
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
    expect(vars['--panel-font']).toContain('Skin Pixel');
    expect(vars['--skin-accent']).toBeTruthy();
  });
});
