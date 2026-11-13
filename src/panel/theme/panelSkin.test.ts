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

  it('uses the skin font when locked and the user font when the skin allows it', () => {
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'lcd', font: 'oswald' })))?.font).toBe('jura');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud', font: 'oswald' })))?.font).toBe('oswald');
    expect(resolveSkin(buildPanelTheme(null, record({ skin: 'hud' })))?.font).toBe('tektur');
  });

  it('applies the skin accent unless the user chose one on an unlocked skin', () => {
    const synced = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud' })));
    expect(synced.accentColor).toBe('#2fd8ff');
    const own = applyPanelSkin(buildPanelTheme(null, record({ skin: 'hud', accentSyncWithDesktop: false, accentColor: '#ff0000' })));
    expect(own.accentColor).toBe('#ff0000');
    const locked = applyPanelSkin(buildPanelTheme(null, record({ skin: 'steampunk', accentSyncWithDesktop: false, accentColor: '#ff0000' })));
    expect(locked.accentColor).toBe('#ffb84a');
  });

  it('applies the skin default mode while synced and the user mode once pinned', () => {
    expect(applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd' }))).themeMode).toBe('light');
    const pinned = applyPanelSkin(buildPanelTheme(null, record({ skin: 'lcd', themeSyncWithDesktop: false, themeMode: 'dark' })));
    expect(pinned.themeMode).toBe('dark');
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
