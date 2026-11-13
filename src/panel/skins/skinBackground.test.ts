import { describe, expect, it } from 'vitest';
import {
  backgroundModeBeforeSkin,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundMode,
} from '../background/panelBackground';
import { applyPanelSkin, resolveSkin, type SkinThemeFields } from '../theme/panelSkin';
import { PANEL_SKINS, einkVars, segmentDisplayVars } from './skins';

const base: SkinThemeFields = {
  skin: null,
  skinAccent: null,
  skinFont: null,
  accentSyncWithDesktop: false,
  accentColor: '',
  font: null,
  widgetOpacity: 1,
  backgroundMode: 'skin',
  backgroundModeBefore: 'shader',
};

function lum(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('skin background mode', () => {
  it('stores the previous mode inside the skin value and reads it back', () => {
    const stored = encodeSkinBackgroundMode('media');
    expect(normalizePanelBackgroundMode(stored)).toBe('skin');
    expect(backgroundModeBeforeSkin(stored)).toBe('media');
    expect(normalizePanelBackgroundMode('skin')).toBe('skin');
    expect(backgroundModeBeforeSkin('skin')).toBe('solid');
    expect(backgroundModeBeforeSkin('shader')).toBe('shader');
  });

  it('falls back to the held mode when the skin is gone', () => {
    expect(applyPanelSkin(base).backgroundMode).toBe('shader');
    expect(applyPanelSkin({ ...base, skin: 'glass' }).backgroundMode).toBe('skin');
  });

  it('marks the skins that own their backdrop', () => {
    const owners = PANEL_SKINS.filter(s => s.prefersSkinBackground).map(s => s.id).sort();
    expect(owners).toEqual(['blueprint', 'crt', 'eink', 'lcd', 'nixie', 'vfd']);
  });
});

describe('skin defaults and overrides', () => {
  it('applies the skin accent whatever the user own accent is', () => {
    const r = resolveSkin({ ...base, skin: 'hud', accentColor: '#ff0000', accentSyncWithDesktop: false })!;
    expect(r.accent).toBe('#2fd8ff');
  });
  it('lets a skin-level accent and font override win', () => {
    const o = { skinAccent: '#00ff00', skinFont: 'jura' };
    expect(resolveSkin({ ...base, skin: 'hud', ...o })).toMatchObject({ accent: '#00ff00', font: 'jura' });
    expect(resolveSkin({ ...base, skin: 'lcd', ...o })).toMatchObject({ accent: '#00ff00', font: 'jura' });
  });
});

describe('skin ink contrast', () => {
  const accents = ['#9bb36a', '#3b82f6', '#f97316', '#ef4444', '#16a34a'];
  it('keeps the LCD ink and its pale cell above 7:1', () => {
    for (const a of accents) {
      const v = segmentDisplayVars(a);
      expect(ratio(v['--skin-deep'], v['--skin-pale'])).toBeGreaterThanOrEqual(7);
    }
  });
  it('keeps the E-ink accent readable on its paper in both modes', () => {
    for (const a of accents) {
      const v = einkVars(a);
      expect(ratio(v['--skin-hi-light'], '#efede4')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v['--skin-hi-dark'], '#121212')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
