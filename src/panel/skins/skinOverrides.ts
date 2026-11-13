import { normalizePanelBackgroundEffect, type PanelBackgroundBase, type PanelBackgroundMode } from '../background/panelBackground';
import { normalizePanelFont } from '../theme/panelFont';
import { normalizePanelSkin, skinDef, type PanelSkinId } from './skins';

export interface SkinOverride {
  accent?: string;
  font?: string;
  // Absent means the Skin background, every skin's default.
  backgroundMode?: PanelBackgroundBase;
  // Only with backgroundMode 'shader'.
  backgroundEffect?: string;
}

export interface StoredSkinOverride {
  accent?: string | null;
  font?: string | null;
  backgroundMode?: string | null;
  backgroundEffect?: string | null;
}

// Keyed by skin id; an entry holds only what differs from that skin's defaults.
export type SkinOverrides = Partial<Record<PanelSkinId, SkinOverride>>;

// The accent picker writes #rrggbb; anything else would reach the skin's color math as NaN.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeSkinOverrides(raw?: Record<string, StoredSkinOverride | null> | null): SkinOverrides {
  const out: SkinOverrides = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    const id = normalizePanelSkin(key);
    if (!id) continue;
    const entry: SkinOverride = {};
    if (value?.accent && HEX_COLOR.test(value.accent)) entry.accent = value.accent;
    const font = normalizePanelFont(value?.font);
    if (font) entry.font = font;
    const mode = value?.backgroundMode;
    if (mode === 'solid' || mode === 'shader' || mode === 'media') entry.backgroundMode = mode;
    const effect = value?.backgroundEffect;
    if (mode === 'shader' && effect && normalizePanelBackgroundEffect(effect) === effect) entry.backgroundEffect = effect;
    if (!isEmpty(entry)) out[id] = entry;
  }
  return out;
}

// Writes one field of a skin's entry. A value equal to the skin default removes the key, and an empty entry is dropped.
export function setSkinOverride(map: SkinOverrides, skin: PanelSkinId, field: 'accent' | 'font', value: string): SkinOverrides {
  const def = skinDef(skin);
  const isDefault = !def || value.toLowerCase() === def[field].toLowerCase();
  const entry: SkinOverride = { ...map[skin] };
  if (isDefault) delete entry[field];
  else entry[field] = value;
  return replaceEntry(map, skin, entry);
}

// Remembers the background mode picked under a skin, and the effect when it is 'shader'; 'skin' removes both.
export function setSkinBackground(map: SkinOverrides, skin: PanelSkinId, mode: PanelBackgroundMode, effect: string): SkinOverrides {
  const entry: SkinOverride = { ...map[skin] };
  delete entry.backgroundMode;
  delete entry.backgroundEffect;
  if (mode !== 'skin') entry.backgroundMode = mode;
  if (mode === 'shader') entry.backgroundEffect = effect;
  return replaceEntry(map, skin, entry);
}

export function resetSkinOverride(map: SkinOverrides, skin: PanelSkinId): SkinOverrides {
  return replaceEntry(map, skin, {});
}

function replaceEntry(map: SkinOverrides, skin: PanelSkinId, entry: SkinOverride): SkinOverrides {
  const next = { ...map };
  if (!isEmpty(entry)) next[skin] = entry;
  else delete next[skin];
  return next;
}

function isEmpty(entry: SkinOverride): boolean {
  return !entry.accent && !entry.font && !entry.backgroundMode;
}
