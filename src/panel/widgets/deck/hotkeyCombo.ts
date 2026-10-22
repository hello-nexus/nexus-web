// Pure helpers for global hotkey bindings: combo normalization and display,
// duplicate detection, and slot matching. Kept free of React so they test directly.
import type { HotkeyBinding, HotkeyDialEvent, HotkeyPlatform } from '../../../api/hotkeys';
import type { DeckAction, DeckConfig, DeckDial, DeckSlot } from './types';
import { authoredPageToFitted, authoredToFitted, type FitGridPreset, type FitGridTarget } from './deckLayout';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const MOD_ALIAS: Record<string, string> = {
  ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', opt: 'Alt', shift: 'Shift',
  meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta', super: 'Meta',
};
const KEY_ALIAS: Record<string, string> = { esc: 'escape', return: 'enter', del: 'delete' };

/** The service's canonical form (`Ctrl+Alt+Shift+Meta+key`), or null for an empty or unparsable combo. */
export function normalizeCombo(combo: string | null | undefined): string | null {
  if (!combo) return null;
  const mods = new Set<string>();
  let key = '';
  for (const raw of combo.split('+')) {
    const token = raw.trim().toLowerCase();
    if (!token) return null;
    const mod = MOD_ALIAS[token];
    if (mod) mods.add(mod);
    else if (key) return null;
    else key = KEY_ALIAS[token] ?? token;
  }
  if (!key) return null;
  return [...MOD_ORDER.filter(m => mods.has(m)), key].join('+');
}

const MAC_MODS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };
// Glyphs are the platform's own marks, so they stay literal.
const MAC_KEYS: Record<string, string> = {
  escape: '⎋', enter: '↩', tab: '⇥', backspace: '⌫', delete: '⌦', pageup: '⇞', pagedown: '⇟', home: '↖', end: '↘',
};
const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
// Keys whose label is a word the user's keyboard prints in their language.
const WORD_KEYS = new Set([
  'escape', 'enter', 'tab', 'backspace', 'delete', 'insert', 'space', 'pageup', 'pagedown', 'home', 'end', 'printscreen',
]);
const MOD_LABEL_KEY: Record<string, string> = { Ctrl: 'hotkeys.key.ctrl', Alt: 'hotkeys.key.alt', Shift: 'hotkeys.key.shift' };

/** A combo as the user's platform labels it: glyphs on macOS (Cmd, Opt), words in the UI language elsewhere. */
export function formatCombo(combo: string | null | undefined, platform: HotkeyPlatform, t: Translate): string {
  const norm = normalizeCombo(combo);
  if (!norm) return '';
  const parts = norm.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const word = (k: string) => (WORD_KEYS.has(k) ? t(`hotkeys.key.${k}`) : (ARROWS[k] ?? k.toUpperCase()));
  if (platform === 'macos') return `${mods.map(m => MAC_MODS[m]).join('')}${MAC_KEYS[key] ?? word(key)}`;
  const modLabel = (m: string) => (m === 'Meta' ? (platform === 'windows' ? 'Win' : 'Super') : t(MOD_LABEL_KEY[m]));
  return [...mods.map(modLabel), word(key)].join(' + ');
}

export type ComboCheck = 'ok' | 'invalid' | 'needsModifier';

/** The service's own rule: one key, and a Ctrl, Alt or Meta unless it is a function key. */
export function checkCombo(combo: string): ComboCheck {
  const norm = normalizeCombo(combo);
  if (!norm) return 'invalid';
  const parts = norm.split('+');
  const key = parts[parts.length - 1];
  if (/^f([1-9]|1\d|2[0-4])$/.test(key)) return 'ok';
  return parts.some(p => p === 'Ctrl' || p === 'Alt' || p === 'Meta') ? 'ok' : 'needsModifier';
}

/** Locale key for a refusal the service is known to send; the generic save failure otherwise. */
function hotkeyErrorKey(msg: string, code?: string): string {
  switch (code) {
    case 'invalidCombo': return 'hotkeys.error.invalidCombo';
    case 'tooMany': return 'hotkeys.error.tooMany';
    case 'invalidId': return 'hotkeys.error.invalidId';
    default: break;
  }
  const m = msg.toLowerCase();
  if (m.includes('invalid combo')) return 'hotkeys.error.invalidCombo';
  if (m.includes('too many')) return 'hotkeys.error.tooMany';
  if (m.includes('invalid hotkey id')) return 'hotkeys.error.invalidId';
  return 'hotkeys.error.save';
}

/** Translated reason for a refused combo or save: the client check, else the service's known refusals. */
export function hotkeyErrorText(t: Translate, msg: string, code?: string): string {
  return t(hotkeyErrorKey(msg, code));
}

/** Another live binding already holding `combo`; like the service, only enabled, non-orphaned bindings count. */
export function findDuplicate(bindings: readonly HotkeyBinding[], combo: string | null, ignoreId?: string): HotkeyBinding | undefined {
  const norm = normalizeCombo(combo);
  if (!norm) return undefined;
  return bindings.find(b => b.id !== ignoreId && b.enabled && b.status !== 'orphaned' && normalizeCombo(b.combo) === norm);
}

/** One-line name of an action target: the nexus op, or the action kind. */
export function describeAction(action: DeckAction, t: Translate): string {
  if (action.type === 'nexus') {
    const { op, value } = action.action;
    if (op === 'lightingBrightnessStep') return t((value ?? 0) < 0 ? 'hotkeys.action.brightnessDown' : 'hotkeys.action.brightnessUp');
    return t(`panel.settings.deck.nexus.${op}`);
  }
  if (action.type === 'page') return t('panel.settings.deck.page.tab', { n: (action.target ?? 0) + 1 });
  return t(`panel.settings.deck.action.${action.type}`);
}

const DIAL_EVENT_KEY: Record<HotkeyDialEvent, string> = {
  push: 'panel.settings.deck.dial.custom.push',
  touch: 'panel.settings.deck.dial.custom.touch',
  turnLeft: 'panel.settings.deck.dial.custom.turnLeft',
  turnRight: 'panel.settings.deck.dial.custom.turnRight',
};

/** Where a tag sits in a preset, in the authored preset's own numbering (0-based indices). */
export type TagLocation =
  | { type: 'key'; page: number; path: number[] }
  | { type: 'dial'; page: number; folderPath: number[]; dial: number; stack?: number; event: HotkeyDialEvent };

const DIAL_EVENTS: HotkeyDialEvent[] = ['turnRight', 'turnLeft', 'push', 'touch'];

function findDialTag(dials: readonly DeckDial[] | undefined, tag: string, page: number, folderPath: number[]): TagLocation | null {
  for (let d = 0; d < (dials?.length ?? 0); d++) {
    const dial = dials![d];
    const entries = (dial.stack?.length ?? 0) >= 2 ? dial.stack! : [dial];
    for (let e = 0; e < entries.length; e++) {
      const action = entries[e].action;
      if (action?.type !== 'custom') continue;
      const event = DIAL_EVENTS.find(ev => action.hotkeyTags?.[ev] === tag);
      if (event) return { type: 'dial', page, folderPath, dial: d, ...((dial.stack?.length ?? 0) >= 2 ? { stack: e } : {}), event };
    }
  }
  return null;
}

function findSlotTag(slots: readonly DeckSlot[], tag: string, page: number, prefix: number[]): TagLocation | null {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].hotkeyTag === tag) return { type: 'key', page, path: [...prefix, i] };
    const folder = slots[i].folder;
    if (!folder) continue;
    const inside = findSlotTag(folder.slots, tag, page, [...prefix, i]) ?? findDialTag(folder.dials, tag, page, [...prefix, i]);
    if (inside) return inside;
  }
  return null;
}

/** Where `tag` sits in `deck`: a key, or one event of a dial entry. Null when nothing carries it. */
export function findTag(deck: DeckConfig, tag: string): TagLocation | null {
  for (let page = 0; page < deck.pages.length; page++) {
    const p = deck.pages[page];
    const found = findSlotTag(p.slots, tag, page, []) ?? findDialTag(p.dials, tag, page, []);
    if (found) return found;
  }
  return null;
}

/** Where a deck binding points, in the authored preset's own numbering (1-based for display). */
export function describeSlot(slot: TagLocation, t: Translate): string {
  const page = slot.page + 1;
  if (slot.type === 'key') {
    const key = slot.path[slot.path.length - 1] + 1;
    const folder = slot.path.slice(0, -1).map(n => n + 1).join('.');
    return folder
      ? t('hotkeys.deck.keyInFolder', { page, folder, key })
      : t('hotkeys.deck.key', { page, key });
  }
  const dial = slot.dial + 1;
  const event = t(DIAL_EVENT_KEY[slot.event]);
  const folder = slot.folderPath.map(n => n + 1).join('.');
  const base = folder
    ? t('hotkeys.deck.dialInFolder', { page, folder, dial, event })
    : t('hotkeys.deck.dial', { page, dial, event });
  return slot.stack === undefined ? base : `${base} (${t('panel.settings.deck.dial.stack.entry', { n: slot.stack + 1 })})`;
}

/**
 * Where the deck editor should open for a slot, in the FITTED pages and slot
 * indices the device page selects by. Null when the slot has no place on
 * that deck's grid.
 */
export function editorTargetFor(
  slot: TagLocation,
  preset: FitGridPreset,
  grid: FitGridTarget,
): { page: number; folderPath: number[]; keyIndex: number; dialIndex?: number } | null {
  const rootOf = slot.type === 'key' ? slot.path[0] : slot.folderPath[0];
  if (rootOf === undefined) {
    // A dial on the page's own level.
    const page = authoredPageToFitted(preset, grid, slot.page);
    return page === null || slot.type === 'key' ? null : { page, folderPath: [], keyIndex: 0, dialIndex: slot.dial };
  }
  const at = authoredToFitted(preset, grid, slot.page, rootOf);
  if (!at) return null;
  if (slot.type === 'key') {
    if (slot.path.length === 1) return { page: at.page, folderPath: [], keyIndex: at.index };
    return { page: at.page, folderPath: [at.index, ...slot.path.slice(1, -1)], keyIndex: slot.path[slot.path.length - 1] };
  }
  return { page: at.page, folderPath: [at.index, ...slot.folderPath.slice(1)], keyIndex: 0, dialIndex: slot.dial };
}

/** What the user calls a binding: its label, else its action, else the deck preset and where the tag sits. */
export function bindingName(
  b: HotkeyBinding,
  t: Translate,
  presetNames: Readonly<Record<string, string>> = {},
  decks: Readonly<Record<string, DeckConfig>> = {},
): string {
  if (b.label) return b.label;
  if (b.target.kind === 'action') return describeAction(b.target.action, t);
  const preset = presetNames[b.target.presetId] ?? t('hotkeys.deck.unknownPreset');
  const deck = decks[b.target.presetId];
  const at = deck ? findTag(deck, b.target.tag) : null;
  return at ? `${preset}: ${describeSlot(at, t)}` : preset;
}
