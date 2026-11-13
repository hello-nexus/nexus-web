import { normalizePanelSkin, skinDef, type PanelSkinId } from './skins';

export interface SkinOverride {
  accent?: string;
  font?: string;
}

// Keyed by skin id; an entry holds only what differs from that skin's defaults.
export type SkinOverrides = Partial<Record<PanelSkinId, SkinOverride>>;

export function normalizeSkinOverrides(raw?: Record<string, { accent?: string | null; font?: string | null }> | null): SkinOverrides {
  const out: SkinOverrides = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    const id = normalizePanelSkin(key);
    if (!id) continue;
    const entry: SkinOverride = {};
    if (value?.accent) entry.accent = value.accent;
    if (value?.font) entry.font = value.font;
    if (entry.accent || entry.font) out[id] = entry;
  }
  return out;
}

// Writes one field of a skin's entry. A value equal to the skin default removes the key, and an empty entry is dropped.
export function setSkinOverride(map: SkinOverrides, skin: PanelSkinId, field: keyof SkinOverride, value: string): SkinOverrides {
  const def = skinDef(skin);
  const isDefault = !def || value.toLowerCase() === def[field].toLowerCase();
  const entry: SkinOverride = { ...map[skin] };
  if (isDefault) delete entry[field];
  else entry[field] = value;
  return replaceEntry(map, skin, entry);
}

export function resetSkinOverride(map: SkinOverrides, skin: PanelSkinId): SkinOverrides {
  return replaceEntry(map, skin, {});
}

function replaceEntry(map: SkinOverrides, skin: PanelSkinId, entry: SkinOverride): SkinOverrides {
  const next = { ...map };
  if (entry.accent || entry.font) next[skin] = entry;
  else delete next[skin];
  return next;
}
