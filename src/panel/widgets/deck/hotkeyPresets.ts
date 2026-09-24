// Categorized hotkey presets for HotkeyInput's "Preset actions" dropdown,
// mirroring Stream Deck's own hotkey picker. `keys` is the same
// plus-joined token string HotkeyInput's capture logic emits and
// DeckActionExecutor.ParseHotkey consumes on the service side.
export interface HotkeyPreset {
  labelKey: string;
  keys: string;
}

export interface HotkeyPresetCategory {
  key: string;
  labelKey: string;
  presets: HotkeyPreset[];
}

export const HOTKEY_PRESET_CATEGORIES: HotkeyPresetCategory[] = [
  {
    key: 'editing',
    labelKey: 'panel.settings.deck.hotkeyPreset.category.editing',
    presets: [
      { labelKey: 'panel.settings.deck.hotkeyPreset.cut', keys: 'ctrl+x' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.copy', keys: 'ctrl+c' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.paste', keys: 'ctrl+v' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.undo', keys: 'ctrl+z' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.redo', keys: 'ctrl+y' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.selectAll', keys: 'ctrl+a' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.save', keys: 'ctrl+s' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.print', keys: 'ctrl+p' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.find', keys: 'ctrl+f' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.emojiPicker', keys: 'meta+.' },
    ],
  },
  {
    key: 'general',
    labelKey: 'panel.settings.deck.hotkeyPreset.category.general',
    presets: [
      { labelKey: 'panel.settings.deck.hotkeyPreset.openFileExplorer', keys: 'meta+e' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.openSettings', keys: 'meta+i' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.preferences', keys: 'ctrl+,' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.openRunDialog', keys: 'meta+r' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.openTaskManager', keys: 'ctrl+shift+escape' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.lock', keys: 'meta+l' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.showDesktop', keys: 'meta+d' },
    ],
  },
  {
    key: 'windowManagement',
    labelKey: 'panel.settings.deck.hotkeyPreset.category.windowManagement',
    presets: [
      { labelKey: 'panel.settings.deck.hotkeyPreset.snapWindowLeft', keys: 'meta+left' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.snapWindowRight', keys: 'meta+right' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.minimizeWindow', keys: 'meta+down' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.maximizeWindow', keys: 'meta+up' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.minimizeAllWindows', keys: 'meta+m' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.minimizeAllExceptActive', keys: 'meta+home' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.closeWindow', keys: 'alt+f4' },
    ],
  },
  {
    key: 'screenshots',
    labelKey: 'panel.settings.deck.hotkeyPreset.category.screenshots',
    presets: [
      { labelKey: 'panel.settings.deck.hotkeyPreset.fullScreenSave', keys: 'meta+printscreen' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.fullScreenClipboard', keys: 'printscreen' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.activeWindowClipboard', keys: 'alt+printscreen' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.snipSketch', keys: 'meta+shift+s' },
      { labelKey: 'panel.settings.deck.hotkeyPreset.openGameBar', keys: 'meta+g' },
    ],
  },
];

/** Select-option id for one preset, unique across every category. */
export function hotkeyPresetId(categoryKey: string, presetIndex: number): string {
  return `${categoryKey}:${presetIndex}`;
}

/** Resolves a hotkeyPresetId back to its preset, or undefined for an unknown id. */
export function findHotkeyPreset(id: string): HotkeyPreset | undefined {
  const [categoryKey, indexPart] = id.split(':');
  const category = HOTKEY_PRESET_CATEGORIES.find(c => c.key === categoryKey);
  if (!category) return undefined;
  return category.presets[Number(indexPart)];
}
