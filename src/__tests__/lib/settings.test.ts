import { describe, it, expect } from 'vitest';
import {
  hexToHsv, hsvToHex, deriveAccentVars,
  loadSettings, saveSettings, getDefaultSettings,
  DEFAULT_ACCENT, PRESET_ACCENTS,
} from '../../lib/settings';

/** WCAG relative luminance of an HSL triple, for contrast assertions. */
function hslLuminance(h: number, s: number, l: number): number {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = lN - c / 2;
  const toLin = (v: number) => {
    const n = v + m;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

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
      '#2563eb', '#3b82f6', '#8b5cf6', '#ec4899',
      '#ef4444', '#f97316', '#f59e0b', '#16c963',
      '#0bbfa9', '#06b6d4',
    ]);
    expect(PRESET_ACCENTS.slice(10)).toEqual([
      '#3e63b8', '#5a85c6', '#8e83c0', '#b96b94',
      '#bf6363', '#bd7958', '#bd8d42', '#5fa07e',
      '#509995', '#4f9aab',
    ]);
  });

  it('leads with deep blue and has no purple column', () => {
    // Row 1 / row 2 col 0 are the deep-blue pair.
    expect(PRESET_ACCENTS[0]).toBe('#2563eb');
    expect(PRESET_ACCENTS[10]).toBe('#3e63b8');
    expect(PRESET_ACCENTS).not.toContain('#a855f7');
    expect(PRESET_ACCENTS).not.toContain('#9333ea');
  });
});

describe('deriveAccentVars', () => {
  it('produces all 6 tokens for dark mode', () => {
    const vars = deriveAccentVars('#8b5cf6', 'dark');
    expect(Object.keys(vars)).toHaveLength(6);
    expect(vars['--accent']).toMatch(/^hsl/);
    expect(vars['--accent-glow']).toMatch(/^hsl/);
    expect(vars['--accent-deep']).toMatch(/^hsl/);
    expect(vars['--accent-soft']).toMatch(/^hsla/);
    expect(vars['--accent-glow-shadow']).toMatch(/^hsla/);
    expect(vars['--accent-text']).toMatch(/^#(000000|ffffff)$/);
  });

  it('produces all 6 tokens for light mode', () => {
    const vars = deriveAccentVars('#8b5cf6', 'light');
    expect(Object.keys(vars)).toHaveLength(6);
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

  it('--accent is the user pick verbatim (no saturation floor)', () => {
    // Gray-ish blue with S≈30 should land on --accent unchanged.
    const vars = deriveAccentVars('#6688aa', 'dark');
    const match = vars['--accent'].match(/hsl\([\d.]+, ([\d.]+)%/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBeLessThan(55);
  });

  it('--accent is the user pick verbatim (no lightness clamp)', () => {
    // Very dark input - --accent stays dark, no clamp to 50.
    const varsDark = deriveAccentVars('#1a0033', 'dark');
    const matchDark = varsDark['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchDark![1])).toBeLessThan(50);

    // Very bright input - --accent stays bright, no clamp to 66.
    const varsBright = deriveAccentVars('#eeccff', 'dark');
    const matchBright = varsBright['--accent'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/);
    expect(parseFloat(matchBright![1])).toBeGreaterThan(66);
  });

  it('--accent-glow / --accent-deep still respect derivation bands', () => {
    // Even with an extreme pick, glow and deep stay usable.
    const vars = deriveAccentVars('#1a0033', 'dark');
    const glowL = parseFloat(vars['--accent-glow'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/)![1]);
    const deepL = parseFloat(vars['--accent-deep'].match(/hsl\([\d.]+, [\d.]+%, ([\d.]+)%/)![1]);
    expect(glowL).toBeGreaterThanOrEqual(58);
    expect(glowL).toBeLessThanOrEqual(80);
    expect(deepL).toBeGreaterThanOrEqual(22);
    expect(deepL).toBeLessThanOrEqual(50);
  });

  it('WCAG: bright yellow gets black text', () => {
    const vars = deriveAccentVars('#f5e642', 'dark');
    expect(vars['--accent-text']).toBe('#000000');
  });

  it('WCAG: dark blue gets white text', () => {
    const vars = deriveAccentVars('#1e3a5f', 'dark');
    expect(vars['--accent-text']).toBe('#ffffff');
  });

  // The warm-to-green band takes black; everything else keeps white even where
  // WCAG alone would flip it (teal and cyan sit ABOVE orange on luminance).
  it.each([
    ['#f97316', 'Orange'],
    ['#f59e0b', 'Amber'],
    ['#16c963', 'Green'],
  ])('%s (%s) gets black text', hex => {
    expect(deriveAccentVars(hex, 'dark')['--accent-text']).toBe('#000000');
  });

  it.each([
    ['#0bbfa9', 'Teal'],
    ['#06b6d4', 'Cyan'],
    ['#8b5cf6', 'Violet'],
    ['#ec4899', 'Pink'],
    ['#ef4444', 'Red'],
    ['#bd8d42', 'Soft amber'],
    ['#5fa07e', 'Soft green'],
    ['#bd7958', 'Soft orange'],
  ])('%s (%s) keeps white text', hex => {
    expect(deriveAccentVars(hex, 'dark')['--accent-text']).toBe('#ffffff');
  });

  // Readability floor above the hue window: a near-white accent of any hue
  // still flips, so a pale custom pick never ships white-on-white.
  it('near-white accents take black text whatever the hue', () => {
    for (const hex of ['#f8d7e8', '#dfe7ff', '#eaeaea', '#d9f7ff']) {
      expect(deriveAccentVars(hex, 'dark')['--accent-text']).toBe('#000000');
    }
  });

  // Every preset that takes BLACK must earn it on contrast. The white side is
  // a deliberate product choice over WCAG (see needsDarkTextOnHsl), so it is
  // held to a lower floor: never worse than white-on-mid-grey.
  it.each(PRESET_ACCENTS)('preset %s stays legible on its accent-text', hex => {
    for (const mode of ['dark', 'light'] as const) {
      const vars = deriveAccentVars(hex, mode);
      const [, h, s, l] = vars['--accent'].match(/hsl\(([\d.]+), ([\d.]+)%, ([\d.]+)%\)/)!;
      const L = hslLuminance(Number(h), Number(s), Number(l));
      if (vars['--accent-text'] === '#000000') {
        expect((L + 0.05) / 0.05).toBeGreaterThanOrEqual(4.5);
      } else {
        expect(1.05 / (L + 0.05)).toBeGreaterThanOrEqual(2.2);
      }
    }
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
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { language: 'de' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.language).toBe('de');
    expect(loaded.general.themeMode).toBe('system');
  });

  it('silently drops legacy `performance` shape from persisted storage', () => {
    // Legacy persisted shape { general, performance }; loadSettings ignores
    // the `.performance` key.
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { language: 'it' },
      performance: { widgetPollingRate: 5000, rgbOutputResolution: '1/4', rgbFpsCap: '60' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.language).toBe('it');
    expect((loaded as Record<string, unknown>).performance).toBeUndefined();
  });

  it('normalizes invalid accent color to default', () => {
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { accentColor: 'garbage' },
    }));
    const loaded = loadSettings();
    expect(loaded.general.accentColor).toBe(DEFAULT_ACCENT);
  });

  it('defaults the custom accent slot to empty, not to the default accent', () => {
    // '' is the "slot never used" marker; falling back to DEFAULT_ACCENT here
    // would paint a swatch the user never picked.
    expect(loadSettings().general.customAccentColor).toBe('');
  });

  it('round-trips and lower-cases the custom accent slot', () => {
    const settings = getDefaultSettings();
    settings.general.customAccentColor = '#AB12CD';
    saveSettings(settings);
    expect(loadSettings().general.customAccentColor).toBe('#ab12cd');
  });

  it('normalizes an invalid custom accent slot to empty', () => {
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { customAccentColor: 'garbage' },
    }));
    expect(loadSettings().general.customAccentColor).toBe('');
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem('nexus_settings', '{broken json');
    const loaded = loadSettings();
    expect(loaded).toEqual(getDefaultSettings());
  });
});
