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

  it('applies the skin default mode, ignoring the user mode; a skin-level mode override wins unless locked', () => {
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd' }))).themeMode).toBe('light');
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', themeSyncWithDesktop: false, themeMode: 'dark' }))).themeMode).toBe('light');
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', skinMode: 'dark' }))).themeMode).toBe('dark');
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'crt', skinMode: 'light' }))).themeMode).toBe('dark');
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
