// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HotkeyBinding } from '../../../api/hotkeys';
import type { DeckConfig } from './types';
import {
  bindingName, checkCombo, describeAction, describeSlot, editorTargetFor, findDuplicate, findTag, formatCombo, hotkeyErrorText, normalizeCombo,
} from './hotkeyCombo';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

function binding(over: Partial<HotkeyBinding> & { id: string }): HotkeyBinding {
  return {
    combo: 'Ctrl+Alt+n', enabled: true, status: 'active',
    target: { kind: 'action', action: { type: 'nexus', action: { op: 'toggleWindow' } } },
    ...over,
  };
}

describe('normalizeCombo', () => {
  it('orders modifiers canonically and lowercases the key', () => {
    expect(normalizeCombo('meta+shift+ctrl+M')).toBe('Ctrl+Shift+Meta+m');
  });

  it('resolves modifier and key aliases the service accepts', () => {
    expect(normalizeCombo('cmd+opt+esc')).toBe('Alt+Meta+escape');
    expect(normalizeCombo('control+del')).toBe('Ctrl+delete');
  });

  it('rejects an empty combo, two keys, and a modifier-only combo', () => {
    expect(normalizeCombo(null)).toBeNull();
    expect(normalizeCombo('')).toBeNull();
    expect(normalizeCombo('ctrl+a+b')).toBeNull();
    expect(normalizeCombo('ctrl+alt')).toBeNull();
  });
});

describe('formatCombo', () => {
  it('uses glyphs on macOS', () => {
    expect(formatCombo('Meta+Alt+n', 'macos', t)).toBe('⌥⌘N');
    expect(formatCombo('ctrl+shift+escape', 'macos', t)).toBe('⌃⇧⎋');
  });

  it('takes modifier and key words from the locale elsewhere and names Meta by platform', () => {
    expect(formatCombo('Ctrl+Alt+n', 'windows', t)).toBe('hotkeys.key.ctrl + hotkeys.key.alt + N');
    expect(formatCombo('Meta+f4', 'windows', t)).toBe('Win + F4');
    expect(formatCombo('Meta+pageup', 'linux', t)).toBe('Super + hotkeys.key.pageup');
    expect(formatCombo('Ctrl+delete', 'windows', t)).toBe('hotkeys.key.ctrl + hotkeys.key.delete');
  });

  it('keeps arrows as glyphs and uses the locale word for space on macOS', () => {
    expect(formatCombo('Ctrl+left', 'windows', t)).toBe('hotkeys.key.ctrl + ←');
    expect(formatCombo('Meta+space', 'macos', t)).toBe('⌘hotkeys.key.space');
  });

  it('is empty for an unbound combo', () => {
    expect(formatCombo(null, 'macos', t)).toBe('');
  });
});

describe('findDuplicate', () => {
  const list = [
    binding({ id: 'a', combo: 'Ctrl+Alt+n' }),
    binding({ id: 'b', combo: 'Ctrl+Alt+l', enabled: false }),
    binding({ id: 'c', combo: null }),
  ];

  it('matches regardless of case or modifier order', () => {
    expect(findDuplicate(list, 'alt+ctrl+N')?.id).toBe('a');
  });

  it('ignores an orphaned binding, which the service does not count either', () => {
    expect(findDuplicate([binding({ id: 'o', combo: 'Ctrl+Alt+k', status: 'orphaned' })], 'ctrl+alt+k')).toBeUndefined();
  });

  it('ignores the binding being edited, disabled bindings and unbound ones', () => {
    expect(findDuplicate(list, 'ctrl+alt+n', 'a')).toBeUndefined();
    expect(findDuplicate(list, 'ctrl+alt+l')).toBeUndefined();
    expect(findDuplicate(list, null)).toBeUndefined();
  });
});

describe('tag locations', () => {
  const dials = [
    { action: { type: 'custom', push: { type: 'hotkey', keys: 'a' }, hotkeyTags: { push: 'tag-dial' } } },
    { stack: [{}, { action: { type: 'custom', turnLeft: { type: 'hotkey', keys: 'a' }, hotkeyTags: { turnLeft: 'tag-stack' } } }] },
  ] as DeckConfig['pages'][number]['dials'];
  const deck: DeckConfig = {
    pages: [
      { slots: [{}, { hotkeyTag: 'tag-key' }, { folder: { slots: [{}, { hotkeyTag: 'tag-folder-key' }], dials: [{ action: { type: 'custom', hotkeyTags: { touch: 'tag-folder-dial' } } }] } }] },
      { slots: [], dials },
    ],
  };

  it('finds a key, a key in a folder, and a dial event wherever it sits', () => {
    expect(findTag(deck, 'tag-key')).toEqual({ type: 'key', page: 0, path: [1] });
    expect(findTag(deck, 'tag-folder-key')).toEqual({ type: 'key', page: 0, path: [2, 1] });
    expect(findTag(deck, 'tag-folder-dial')).toEqual({ type: 'dial', page: 0, folderPath: [2], dial: 0, event: 'touch' });
    expect(findTag(deck, 'tag-dial')).toEqual({ type: 'dial', page: 1, folderPath: [], dial: 0, event: 'push' });
  });

  it('reports a stack entry, and nothing for a tag that is gone', () => {
    expect(findTag(deck, 'tag-stack')).toEqual({ type: 'dial', page: 1, folderPath: [], dial: 1, stack: 1, event: 'turnLeft' });
    expect(findTag(deck, 'missing')).toBeNull();
  });

  it('keeps finding a tag after the slot moves, because the tag travels with it', () => {
    const swapped: DeckConfig = { pages: [{ slots: [{ hotkeyTag: 'tag-key' }, {}] }] };
    expect(findTag(swapped, 'tag-key')).toEqual({ type: 'key', page: 0, path: [0] });
  });

  it('describes keys, folder keys and dial entries in 1-based numbers', () => {
    expect(describeSlot({ type: 'key', page: 0, path: [3] }, t)).toBe('hotkeys.deck.key:{"page":1,"key":4}');
    expect(describeSlot({ type: 'key', page: 1, path: [2, 5] }, t)).toBe('hotkeys.deck.keyInFolder:{"page":2,"folder":"3","key":6}');
    expect(describeSlot({ type: 'dial', page: 0, folderPath: [], dial: 1, stack: 1, event: 'push' }, t)).toContain('hotkeys.deck.dial:{"page":1,"dial":2');
    expect(describeSlot({ type: 'dial', page: 0, folderPath: [], dial: 1, stack: 1, event: 'push' }, t)).toContain('panel.settings.deck.dial.stack.entry');
  });

  it('opens the editor on the FITTED page and slot, not the authored ones', () => {
    const slots = Array.from({ length: 6 }, (_, i) => ({ label: String(i) }));
    const preset = { cols: 3, rows: 2, deck: { pages: [{ slots }] } };
    const grid = { cols: 2, rows: 2, kind: 'physical' as const };
    const at = editorTargetFor({ type: 'key', page: 0, path: [5] }, preset, grid);
    expect(at).not.toBeNull();
    expect(at!.page).toBeGreaterThan(0);
    expect(at!.keyIndex).not.toBe(5);
  });

  it('opens a folder key through the fitted index of its root slot', () => {
    const preset = { cols: 2, rows: 2, deck: { pages: [{ slots: [{}, {}, { folder: { slots: [{}, {}] } }, {}] }] } };
    const grid = { cols: 2, rows: 2, kind: 'physical' as const };
    expect(editorTargetFor({ type: 'key', page: 0, path: [2, 1] }, preset, grid)).toEqual({ page: 0, folderPath: [2], keyIndex: 1 });
    expect(editorTargetFor({ type: 'key', page: 0, path: [3] }, preset, grid)).toEqual({ page: 0, folderPath: [], keyIndex: 3 });
    expect(editorTargetFor({ type: 'dial', page: 0, folderPath: [], dial: 1, event: 'push' }, preset, grid)).toEqual({ page: 0, folderPath: [], keyIndex: 0, dialIndex: 1 });
  });
});

describe('describeAction', () => {
  it('names the brightness step by direction', () => {
    expect(describeAction({ type: 'nexus', action: { op: 'lightingBrightnessStep', value: 0.1 } }, t)).toBe('hotkeys.action.brightnessUp');
    expect(describeAction({ type: 'nexus', action: { op: 'lightingBrightnessStep', value: -0.1 } }, t)).toBe('hotkeys.action.brightnessDown');
  });

  it('uses the nexus op label and the action kind label', () => {
    expect(describeAction({ type: 'nexus', action: { op: 'toggleWindow' } }, t)).toBe('panel.settings.deck.nexus.toggleWindow');
    expect(describeAction({ type: 'openUrl', url: 'x' }, t)).toBe('panel.settings.deck.action.openUrl');
  });
});

describe('checkCombo', () => {
  it('needs Ctrl, Alt or Meta unless the key is a function key', () => {
    expect(checkCombo('ctrl+k')).toBe('ok');
    expect(checkCombo('meta+alt+n')).toBe('ok');
    expect(checkCombo('f5')).toBe('ok');
    expect(checkCombo('shift+f12')).toBe('ok');
    expect(checkCombo('shift+k')).toBe('needsModifier');
    expect(checkCombo('k')).toBe('needsModifier');
    expect(checkCombo('ctrl+alt')).toBe('invalid');
  });
});

describe('hotkeyErrorText', () => {
  it('maps by the stable code first, then by the known message', () => {
    expect(hotkeyErrorText(t, 'whatever', 'tooMany')).toBe('hotkeys.error.tooMany');
    expect(hotkeyErrorText(t, 'invalid combo')).toBe('hotkeys.error.invalidCombo');
    expect(hotkeyErrorText(t, 'invalid hotkey id')).toBe('hotkeys.error.invalidId');
    expect(hotkeyErrorText(t, 'something odd')).toBe('hotkeys.error.save');
  });
});

describe('bindingName', () => {
  it('prefers the label, then the action, then the preset and slot', () => {
    expect(bindingName(binding({ id: 'a', label: 'Mine' }), t)).toBe('Mine');
    expect(bindingName(binding({ id: 'a' }), t)).toBe('panel.settings.deck.nexus.toggleWindow');
    const deck = binding({ id: 'd', target: { kind: 'deck', presetId: 'p1', tag: 'd' } });
    const configs = { p1: { pages: [{ slots: [{ hotkeyTag: 'd' }] }] } };
    expect(bindingName(deck, t, { p1: 'Streaming' }, configs)).toContain('Streaming: hotkeys.deck.key');
    expect(bindingName(deck, t, { p1: 'Streaming' })).toBe('Streaming');
    expect(bindingName(deck, t)).toBe('hotkeys.deck.unknownPreset');
  });
});
