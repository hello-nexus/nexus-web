// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HOTKEY_PRESET_CATEGORIES, hotkeyPresetId, findHotkeyPreset } from './hotkeyPresets';

describe('HOTKEY_PRESET_CATEGORIES shape', () => {
  it('has four categories, each with a key, a labelKey, and at least one preset', () => {
    expect(HOTKEY_PRESET_CATEGORIES).toHaveLength(4);
    for (const category of HOTKEY_PRESET_CATEGORIES) {
      expect(typeof category.key).toBe('string');
      expect(category.key.length).toBeGreaterThan(0);
      expect(category.labelKey).toMatch(/^panel\.settings\.deck\.hotkeyPreset\.category\./);
      expect(category.presets.length).toBeGreaterThan(0);
    }
  });

  it('every category key is unique', () => {
    const keys = HOTKEY_PRESET_CATEGORIES.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every preset has a labelKey under the hotkeyPreset namespace and a non-empty plus-joined keys string', () => {
    for (const category of HOTKEY_PRESET_CATEGORIES) {
      for (const preset of category.presets) {
        expect(preset.labelKey).toMatch(/^panel\.settings\.deck\.hotkeyPreset\./);
        expect(preset.keys.length).toBeGreaterThan(0);
        expect(preset.keys).toBe(preset.keys.toLowerCase());
      }
    }
  });

  it('carries the documented Editing category entries in order, including the printscreen/period keys', () => {
    const editing = HOTKEY_PRESET_CATEGORIES.find(c => c.key === 'editing');
    expect(editing?.presets.map(p => p.keys)).toEqual([
      'ctrl+x', 'ctrl+c', 'ctrl+v', 'ctrl+z', 'ctrl+y', 'ctrl+a', 'ctrl+s', 'ctrl+p', 'ctrl+f', 'meta+.',
    ]);
  });

  it('includes the ctrl+, preferences shortcut in the General category', () => {
    const general = HOTKEY_PRESET_CATEGORIES.find(c => c.key === 'general');
    expect(general?.presets.map(p => p.keys)).toContain('ctrl+,');
  });

  it('carries the documented Screenshots category entries, including the bare and modified printscreen tokens', () => {
    const screenshots = HOTKEY_PRESET_CATEGORIES.find(c => c.key === 'screenshots');
    expect(screenshots?.presets.map(p => p.keys)).toEqual([
      'meta+printscreen', 'printscreen', 'alt+printscreen', 'meta+shift+s', 'meta+g',
    ]);
  });
});

describe('hotkeyPresetId / findHotkeyPreset', () => {
  it('round-trips an id back to the exact preset object', () => {
    const category = HOTKEY_PRESET_CATEGORIES[0];
    const preset = category.presets[0];
    const id = hotkeyPresetId(category.key, 0);
    expect(findHotkeyPreset(id)).toBe(preset);
  });

  it('returns undefined for an unknown category or an out-of-range index', () => {
    expect(findHotkeyPreset('not-a-category:0')).toBeUndefined();
    expect(findHotkeyPreset(`${HOTKEY_PRESET_CATEGORIES[0].key}:999`)).toBeUndefined();
  });
});
