import { describe, it, expect } from 'vitest';
import {
  BG_PRESETS_DARK,
  BG_PRESETS_LIGHT,
  DEFAULT_PANEL_BG_DARK,
  DEFAULT_PANEL_BG_LIGHT,
  defaultPanelWidgetPadding,
  isPanelBackgroundPreset,
  normalizePanelWidgetPadding,
  panelBackgroundPair,
  panelBackgroundPresets,
  resolvePanelBackground,
} from '../../panel/background/panelBackground';

describe('panel background presets', () => {
  it('keeps dark and light palettes as paired two-row grids', () => {
    expect(BG_PRESETS_DARK).toHaveLength(20);
    expect(BG_PRESETS_LIGHT).toHaveLength(20);
    expect(BG_PRESETS_DARK[0]).toBe(DEFAULT_PANEL_BG_DARK);
    expect(BG_PRESETS_LIGHT[0]).toBe(DEFAULT_PANEL_BG_LIGHT);
    expect(panelBackgroundPresets('dark')).toBe(BG_PRESETS_DARK);
    expect(panelBackgroundPresets('light')).toBe(BG_PRESETS_LIGHT);

    expect(BG_PRESETS_DARK.slice(0, 10)).toEqual([
      '#0f0f0f', '#1f0d36', '#2c0d20', '#2c0d0d',
      '#2c1408', '#2a1607', '#082617', '#082621',
      '#07242f', '#0e1c38',
    ]);
    expect(BG_PRESETS_DARK.slice(10)).toEqual([
      '#262626', '#581c87', '#831843', '#7f1d1d',
      '#7c2d12', '#78350f', '#064e3b', '#115e59',
      '#155e75', '#1e3a8a',
    ]);
    expect(BG_PRESETS_LIGHT.slice(0, 10)).toEqual([
      '#fafafa', '#f3e8ff', '#fce7f3', '#fee2e2',
      '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1',
      '#cffafe', '#dbeafe',
    ]);
    expect(BG_PRESETS_LIGHT.slice(10)).toEqual([
      '#d4d4d4', '#d8b4fe', '#f9a8d4', '#fca5a5',
      '#fdba74', '#fcd34d', '#86efac', '#5eead4',
      '#67e8f9', '#93c5fd',
    ]);
  });

  it('drops the yellow-green column entirely', () => {
    expect(BG_PRESETS_DARK).not.toContain('#12180d');
    expect(BG_PRESETS_DARK).not.toContain('#365314');
    expect(BG_PRESETS_LIGHT).not.toContain('#f7fee7');
    expect(BG_PRESETS_LIGHT).not.toContain('#ecfccb');
  });

  it('column 0 is neutral grayscale; row 2 is more colorful than row 1', () => {
    // Column 0 is the explicit "no tint" neutral default.
    expect(BG_PRESETS_DARK[0]).toBe('#0f0f0f');
    expect(BG_PRESETS_LIGHT[0]).toBe('#fafafa');
    expect(BG_PRESETS_DARK[10]).toBe('#262626');
    expect(BG_PRESETS_LIGHT[10]).toBe('#d4d4d4');

    // Tinted column (violet, index 1) shows the row-1 subtle vs row-2 vivid contrast.
    expect(BG_PRESETS_LIGHT[1]).toBe('#f3e8ff');
    expect(BG_PRESETS_LIGHT[11]).toBe('#d8b4fe');
    expect(BG_PRESETS_DARK[1]).toBe('#1f0d36');
    expect(BG_PRESETS_DARK[11]).toBe('#581c87');
  });

  it('switching theme always picks the matching column from the same seed slot', () => {
    // Row 2 dark navy (DARK[19]) - switching to light returns its paired pastel (LIGHT[19]).
    expect(resolvePanelBackground('#1e3a8a', '', 'light')).toBe('#93c5fd');
    expect(resolvePanelBackground('', '#93c5fd', 'dark')).toBe('#1e3a8a');

    // Row 2 deep purple (#581c87) paired with a stale amber light pick: the
    // resolver derives from the dark seed, ignoring the stale light value.
    expect(resolvePanelBackground('#581c87', '#fdba74', 'light')).toBe('#d8b4fe');
    expect(resolvePanelBackground('#581c87', '#fdba74', 'dark')).toBe('#581c87');
  });

  it('non-preset custom hex values pass through unchanged for both themes', () => {
    // No legacy-alias mapping: a value that is not a current preset stays as-is.
    expect(resolvePanelBackground('#12180d', '', 'light')).toBe('#12180d');
    expect(resolvePanelBackground('#1a1a24', '', 'light')).toBe('#1a1a24');
    expect(resolvePanelBackground('', '#ecfccb', 'dark')).toBe('#ecfccb');

    expect(isPanelBackgroundPreset('#12180d')).toBe(false);
    expect(isPanelBackgroundPreset('#1A1A24')).toBe(false);
    expect(isPanelBackgroundPreset('#abcdef')).toBe(false);
  });

  it('preset detection is case-insensitive', () => {
    expect(isPanelBackgroundPreset('#0F0F0F')).toBe(true);
    expect(isPanelBackgroundPreset('#fafafa')).toBe(true);
    expect(isPanelBackgroundPreset('#1E3A8A')).toBe(true);
  });
});

describe('panelBackgroundPair', () => {
  it('returns the column-matched dark/light pair for any preset', () => {
    // Row 2 dark navy
    expect(panelBackgroundPair('#1e3a8a')).toEqual({ dark: '#1e3a8a', light: '#93c5fd' });
    // Row 1 light teal
    expect(panelBackgroundPair('#ccfbf1')).toEqual({ dark: '#082621', light: '#ccfbf1' });
    // Default neutral slot
    expect(panelBackgroundPair(DEFAULT_PANEL_BG_DARK)).toEqual({
      dark: DEFAULT_PANEL_BG_DARK,
      light: DEFAULT_PANEL_BG_LIGHT,
    });
  });

  it('falls back to identical hex for non-preset custom values', () => {
    expect(panelBackgroundPair('#abcdef')).toEqual({ dark: '#abcdef', light: '#abcdef' });
    expect(panelBackgroundPair('#0a0a10')).toEqual({ dark: '#0a0a10', light: '#0a0a10' });
  });
});

describe('normalizePanelWidgetPadding', () => {
  it('defaults to 50 percent', () => {
    expect(defaultPanelWidgetPadding()).toBe(50);
    expect(normalizePanelWidgetPadding(null)).toBe(50);
    expect(normalizePanelWidgetPadding(undefined)).toBe(50);
    expect(normalizePanelWidgetPadding(Number.NaN)).toBe(50);
  });

  it('clamps a stored value to 0-100', () => {
    expect(normalizePanelWidgetPadding(-20)).toBe(0);
    expect(normalizePanelWidgetPadding(150)).toBe(100);
    expect(normalizePanelWidgetPadding(75)).toBe(75);
  });
});
