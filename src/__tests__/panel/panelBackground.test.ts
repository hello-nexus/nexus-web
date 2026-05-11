import { describe, it, expect } from 'vitest';
import {
  BG_PRESETS_DARK,
  BG_PRESETS_LIGHT,
  DEFAULT_PANEL_BG_DARK,
  DEFAULT_PANEL_BG_LIGHT,
  isPanelBackgroundPreset,
  panelBackgroundPair,
  panelBackgroundPresets,
  resolvePanelBackground,
} from '../../panel/panelBackground';

describe('panel background presets', () => {
  it('keeps dark and light palettes as paired two-row grids', () => {
    expect(BG_PRESETS_DARK).toHaveLength(20);
    expect(BG_PRESETS_LIGHT).toHaveLength(20);
    expect(BG_PRESETS_DARK[0]).toBe(DEFAULT_PANEL_BG_DARK);
    expect(BG_PRESETS_LIGHT[0]).toBe(DEFAULT_PANEL_BG_LIGHT);
    expect(panelBackgroundPresets('dark')).toBe(BG_PRESETS_DARK);
    expect(panelBackgroundPresets('light')).toBe(BG_PRESETS_LIGHT);

    expect(BG_PRESETS_DARK.slice(0, 10)).toEqual([
      '#1a1033', '#1f0d36', '#2c0d20', '#2c0d0d',
      '#2c1408', '#2a1607', '#082617', '#082621',
      '#07242f', '#0e1c38',
    ]);
    expect(BG_PRESETS_DARK.slice(10)).toEqual([
      '#3b0764', '#581c87', '#831843', '#7f1d1d',
      '#7c2d12', '#78350f', '#064e3b', '#115e59',
      '#155e75', '#1e3a8a',
    ]);
    expect(BG_PRESETS_LIGHT.slice(0, 10)).toEqual([
      '#ede9fe', '#f3e8ff', '#fce7f3', '#fee2e2',
      '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1',
      '#cffafe', '#dbeafe',
    ]);
    expect(BG_PRESETS_LIGHT.slice(10)).toEqual([
      '#c4b5fd', '#d8b4fe', '#f9a8d4', '#fca5a5',
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

  it('row 1 light is more colorful than near-white and row 2 light is much more colorful', () => {
    // Row 1 (subtle pastel) vs row 2 (vivid pastel) - vivid sits at Tailwind 200/300, subtle at 100.
    expect(BG_PRESETS_LIGHT[0]).toBe('#ede9fe');
    expect(BG_PRESETS_LIGHT[10]).toBe('#c4b5fd');
    // Row 1 dark sits between near-black and the deep row 2.
    expect(BG_PRESETS_DARK[0]).toBe('#1a1033');
    expect(BG_PRESETS_DARK[10]).toBe('#3b0764');
  });

  it('switching theme always picks the matching column instead of restoring a separate selection', () => {
    // Dark navy in row 2 col 10 - switching to light returns its column-paired pastel.
    expect(resolvePanelBackground('#1e3a8a', '', 'light')).toBe('#93c5fd');
    expect(resolvePanelBackground('', '#93c5fd', 'dark')).toBe('#1e3a8a');

    // Even when the user previously stored an unrelated value in the other slot,
    // the resolver derives from the dark seed and ignores the stale light pick.
    // Picking deep violet in dark and a pastel orange in light yields the
    // bolder pastel violet on light, not the stale orange.
    expect(resolvePanelBackground('#3b0764', '#fdba74', 'light')).toBe('#c4b5fd');
    // And dark still resolves from its own slot (deep violet).
    expect(resolvePanelBackground('#3b0764', '#fdba74', 'dark')).toBe('#3b0764');
  });

  it('keeps legacy dropped-column values theme-safe', () => {
    // Old lime / olive / teal column values are routed to the closest
    // green/teal column in the new arrays.
    expect(resolvePanelBackground('#12180d', '', 'light')).toBe('#dcfce7');
    expect(resolvePanelBackground('#365314', '', 'light')).toBe('#86efac');
    expect(resolvePanelBackground('#134e4a', '', 'light')).toBe('#5eead4');

    expect(resolvePanelBackground('', '#f7fee7', 'dark')).toBe('#082617');
    expect(resolvePanelBackground('', '#ecfccb', 'dark')).toBe('#064e3b');
  });

  it('keeps legacy near-grayscale and old row-1 values theme-safe', () => {
    // Pre-redesign greyscale presets stay theme-safe.
    expect(resolvePanelBackground('#1a1a24', '', 'light')).toBe('#e6e6f2');
    expect(resolvePanelBackground('#000000', '', 'light')).toBe('#ffffff');
    expect(resolvePanelBackground('', '#ffffff', 'dark')).toBe('#000000');

    // Old dark row 1 (near-black with hue hint) maps per column to the new
    // light row 1 - a theme switch stays in the same hue family.
    expect(resolvePanelBackground('#0a0a10', '', 'light')).toBe('#ede9fe');
    expect(resolvePanelBackground('#0d1117', '', 'light')).toBe('#dbeafe');

    // Old light row 1 (near-white with hue hint) maps per column to the new
    // dark row 1.
    expect(resolvePanelBackground('', '#fafaff', 'dark')).toBe('#1a1033');
    expect(resolvePanelBackground('', '#eff6ff', 'dark')).toBe('#0e1c38');

    expect(isPanelBackgroundPreset('#1A1A24')).toBe(true);
    expect(isPanelBackgroundPreset('#0A0A10')).toBe(true);
    expect(isPanelBackgroundPreset('#FAFAFF')).toBe(true);
  });
});

describe('panelBackgroundPair', () => {
  it('returns the column-matched dark/light pair for any preset', () => {
    // Row 2 dark navy
    expect(panelBackgroundPair('#1e3a8a')).toEqual({ dark: '#1e3a8a', light: '#93c5fd' });
    // Row 1 light teal
    expect(panelBackgroundPair('#ccfbf1')).toEqual({ dark: '#082621', light: '#ccfbf1' });
    // Default slot
    expect(panelBackgroundPair(DEFAULT_PANEL_BG_DARK)).toEqual({
      dark: DEFAULT_PANEL_BG_DARK,
      light: DEFAULT_PANEL_BG_LIGHT,
    });
  });

  it('routes legacy values through their alias to the matching column', () => {
    // Old dark row 1 violet -> new dark/light row 1 violet pair.
    expect(panelBackgroundPair('#0a0a10')).toEqual({ dark: '#1a1033', light: '#ede9fe' });
    // Old light row 1 amber -> new dark/light row 1 amber pair.
    expect(panelBackgroundPair('#fffbeb')).toEqual({ dark: '#2a1607', light: '#fef3c7' });
    // Dropped lime column legacies still route to the green-family bold pair.
    expect(panelBackgroundPair('#ecfccb')).toEqual({ dark: '#064e3b', light: '#86efac' });
  });

  it('falls back to identical hex for non-preset custom values', () => {
    expect(panelBackgroundPair('#abcdef')).toEqual({ dark: '#abcdef', light: '#abcdef' });
  });
});
