import { describe, it, expect } from 'vitest';
import {
  hexToHsv, hsvToHex, deriveAccentVars,
  loadSettings, saveSettings, getDefaultSettings,
  DEFAULT_ACCENT, PRESET_ACCENTS,
} from '../../lib/settings';

describe('hexToHsv / hsvToHex round-trip', () => {
  const cases = [
    '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000',
    '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#10b981',
  ];

  for (const hex of cases) {
    it(`round-trips ${hex}`, () => {
      const { h, s, v } = hexToHsv(hex);
      const result = hsvToHex(h, s, v);
      expect(result).toBe(hex);
    });
  }

  it('handles hue wrapping at 360', () => {
    const hex = hsvToHex(360, 100, 100);
    expect(hex).toBe('#ff0000');
  });

  it('handles negative hue', () => {
    const hex = hsvToHex(-60, 100, 100);
    expect(hex).toBe('#ff00ff');
  });
});

describe('PRESET_ACCENTS', () => {
  it('keeps the accent palette as two vertically paired rows', () => {
    expect(PRESET_ACCENTS).toHaveLength(20);
    expect(PRESET_ACCENTS[0]).toBe(DEFAULT_ACCENT);
    expect(PRESET_ACCENTS.slice(0, 10)).toEqual([
      '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899',
      '#ef4444', '#f97316', '#f59e0b', '#22c55e',
      '#14b8a6', '#06b6d4',
    ]);
    expect(PRESET_ACCENTS.slice(10)).toEqual([
      '#1e3a8a', '#6d28d9', '#9333ea', '#db2777',
      '#b91c1c', '#c2410c', '#b45309', '#15803d',
      '#0f766e', '#0e7490',
    ]);
  });

  it('leads with blue / navy and has no yellow-green column', () => {
    // Row 1 / row 2 col 0 are the blue pair — the new default.
    expect(PRESET_ACCENTS[0]).toBe('#3b82f6');
    expect(PRESET_ACCENTS[10]).toBe('#1e3a8a');
    // The previous lime / olive-lime column is gone.
    expect(PRESET_ACCENTS).not.toContain('#84cc16');
    expect(PRESET_ACCENTS).not.toContain('#4d7c0f');
  });
});

describe('deriveAccentVars', () => {
  it('produces all 8 tokens for dark mode', () => {
    const vars = deriveAccentVars('#8b5cf6', 'dark');
    expect(Object.keys(vars)).toHaveLength(8);
    expect(vars['--accent']).toMatch(/^hsl/);
    expect(vars['--accent-glow']).toMatch(/^hsl/);
    expect(vars['--accent-deep']).toMatch(/^hsl/);
    expect(vars['--accent-soft']).toMatch(/^hsla/);
    expect(vars['--accent-glow-shadow']).toMatch(/^hsla/);
    expect(vars['--accent-text']).toMatch(/^#(000000|ffffff)$/);
    expect(vars['--accent-glow-text']).toMatch(/^#(000000|ffffff)$/);
    expect(vars['--accent-deep-text']).toMatch(/^#(000000|ffffff)$/);
  });

  it('produces all 8 tokens for light mode', () => {
    const vars = deriveAccentVars('#8b5cf6', 'light');
    expect(Object.keys(vars)).toHaveLength(8);
    expect(vars['--accent']).toMatch(/^hsl/);
  });

  it('no NaN in any token value', () => {
    for (const preset of PRESET_ACCENTS) {
      for (const mode of ['dark', 'light'] as const) {
        const vars = deriveAccentVars(preset, mode);
        for (const [key, val] of Object.entries(vars)) {
          expect(val, `${key} for ${preset} ${mode}`).not.toContain('NaN');
        }
      }
    }
  });

  it('enforces saturation floor - muted input gets boosted', () => {
    // Gray-ish blue with S=30 should be boosted to S>=55
    const vars = deriveAccentVars('#6688aa', 'dark');
    const match = vars['--accent'].match(/hsl\([\d.]+, ([\d.]+)%/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBeGreaterThanOrEqual(55);
  });

  it('dark mode lightness stays in [50, 66]', () => {
    // Very dark input
    const varsDark = deriveAccentVars('#1a0033', 'dark');
    const matchDark = varsDark['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchDark![1])).toBeGreaterThanOrEqual(50);

    // Very bright input
    const varsBright = deriveAccentVars('#eeccff', 'dark');
    const matchBright = varsBright['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchBright![1])).toBeLessThanOrEqual(66);
  });

  it('light mode lightness stays in [40, 54]', () => {
    const varsDark = deriveAccentVars('#1a0033', 'light');
    const matchDark = varsDark['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchDark![1])).toBeGreaterThanOrEqual(40);

    const varsBright = deriveAccentVars('#eeccff', 'light');
    const matchBright = varsBright['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchBright![1])).toBeLessThanOrEqual(54);
  });

  it('WCAG: bright yellow gets black text', () => {
    const vars = deriveAccentVars('#f5e642', 'dark');
    expect(vars['--accent-text']).toBe('#000000');
  });

  it('WCAG: dark blue gets white text', () => {
    const vars = deriveAccentVars('#1e3a5f', 'dark');
    expect(vars['--accent-text']).toBe('#ffffff');
  });

  it('normalizes invalid hex to default', () => {
    const vars = deriveAccentVars('not-a-color', 'dark');
    const defaultVars = deriveAccentVars(DEFAULT_ACCENT, 'dark');
    expect(vars['--accent']).toBe(defaultVars['--accent']);
  });

  it('normalizes empty string to default', () => {
    const vars = deriveAccentVars('', 'dark');
    const defaultVars = deriveAccentVars(DEFAULT_ACCENT, 'dark');
    expect(vars['--accent']).toBe(defaultVars['--accent']);
  });
});

describe('loadSettings / saveSettings', () => {
  it('returns defaults when localStorage is empty', () => {
    const settings = loadSettings();
    expect(settings.general.language).toBe('en');
    expect(settings.general.accentColor).toBe(DEFAULT_ACCENT);
    expect(settings.general.themeMode).toBe('system');
  });

  it('round-trips through save/load', () => {
    const settings = getDefaultSettings();
    settings.general.language = 'ja';
    settings.general.accentColor = '#ef4444';
    saveSettings(settings);

    const loaded = loadSettings();
    expect(loaded.general.language).toBe('ja');
    expect(loaded.general.accentColor).toBe('#ef4444');
  });

  it('merges partial saved data with defaults', () => {
    localStorage.setItem('qos_settings', JSON.stringify({
      general: { language: 'de' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.language).toBe('de');
    expect(loaded.general.themeMode).toBe('system');
  });

  it('silently drops legacy `performance` shape from persisted storage', () => {
    // Older builds persisted { general: {...}, performance: {...} }. loadSettings
    // no longer reads `.performance` so the stale key is simply ignored.
    localStorage.setItem('qos_settings', JSON.stringify({
      general: { language: 'it' },
      performance: { widgetPollingRate: 5000, rgbOutputResolution: '1/4', rgbFpsCap: '60' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.language).toBe('it');
    // No `performance` field on the returned shape; type doesn't exist.
    expect((loaded as Record<string, unknown>).performance).toBeUndefined();
  });

  it('normalizes invalid accent color to default', () => {
    localStorage.setItem('qos_settings', JSON.stringify({
      general: { accentColor: 'garbage' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.accentColor).toBe(DEFAULT_ACCENT);
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem('qos_settings', '{broken json');
    const loaded = loadSettings();
    expect(loaded).toEqual(getDefaultSettings());
  });
});
