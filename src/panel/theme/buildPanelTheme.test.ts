import { describe, it, expect } from 'vitest';
import { buildPanelTheme } from './panelTheme';
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

  it('defaults a wallpaper-capable panel with no stored choice to the wallpaper', () => {
    expect(buildPanelTheme(null, y70()).backdrop).toBe('wallpaper');
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

  it('takes the sync sources from preferences', () => {
    const prefs = { theme: { themeMode: 'dark', resolvedThemeMode: 'dark', accentColor: '#ff0000' } } as Preferences;
    const theme = buildPanelTheme(prefs, y70());
    expect(theme.appThemeMode).toBe('dark');
    expect(theme.appResolvedThemeMode).toBe('dark');
    expect(theme.appAccentColor).toBe('#ff0000');
  });
});
