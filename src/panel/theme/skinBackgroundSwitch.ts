import type { PanelDevicePatch } from '../../api/panel';
import {
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundTemplate,
  type PanelBackdrop,
  type PanelBackgroundBase,
  type PanelBackgroundMode,
  type SkinBackgroundHeld,
} from '../background/panelBackground';
import { setSkinBackground, type SkinOverrides } from '../skins/skinOverrides';
import type { PanelSkinId } from '../skins/skins';

// The background fields a Skin background takes over, and the user's own values it must give back.
export interface SkinBackgroundFields {
  backgroundMode: PanelBackgroundMode;
  backgroundModeBefore: PanelBackgroundBase;
  backdrop: PanelBackdrop;
  backgroundFrost: number;
  backgroundOpacity: number;
  backgroundHeld?: SkinBackgroundHeld | null;
}

export interface BackgroundSwitch {
  theme: Partial<SkinBackgroundFields>;
  patch: PanelDevicePatch;
}

// Entering Skin resets frost and opacity (only opacity stays editable there) and remembers what it replaced.
export function enterSkinBackground(cur: SkinBackgroundFields): BackgroundSwitch {
  const inSkin = cur.backgroundMode === 'skin';
  const before = inSkin ? cur.backgroundModeBefore : cur.backgroundMode as PanelBackgroundBase;
  const held = inSkin
    ? cur.backgroundHeld ?? null
    : { backdrop: cur.backdrop, frost: cur.backgroundFrost, opacity: cur.backgroundOpacity };
  return {
    theme: { backdrop: 'theme', backgroundMode: 'skin', backgroundModeBefore: before, backgroundHeld: held, backgroundFrost: 0, backgroundOpacity: 1 },
    patch: { backdrop: 'theme', backgroundMode: encodeSkinBackgroundMode(before, held), backgroundFrostLevel: 0, backgroundOpacity: 1 },
  };
}

// Leaving Skin (skin removed, or another background chip picked) gives back the frost and opacity held, and the
// backdrop when the mode returns to the one that was held. Without held values only the mode changes.
export function leaveSkinBackground(cur: SkinBackgroundFields, to: PanelBackgroundBase | null = null): BackgroundSwitch {
  const mode = to ?? cur.backgroundModeBefore;
  const held = cur.backgroundHeld ?? null;
  if (!held) return { theme: { backgroundMode: mode, backgroundModeBefore: mode, backgroundHeld: null }, patch: { backgroundMode: mode } };
  const restoresBackdrop = mode === cur.backgroundModeBefore;
  const backdrop = restoresBackdrop ? held.backdrop : cur.backdrop;
  // A non-theme backdrop stays opaque, so a mode that does not bring it back does not inherit its opacity.
  const opacity = !restoresBackdrop && held.backdrop !== 'theme' ? 1 : held.opacity;
  return {
    theme: { backgroundMode: mode, backgroundModeBefore: mode, backgroundHeld: null, backdrop, backgroundFrost: held.frost, backgroundOpacity: opacity },
    patch: { backgroundMode: mode, backdrop, backgroundFrostLevel: held.frost, backgroundOpacity: opacity },
  };
}

export interface SkinPickFields extends SkinBackgroundFields {
  skin: PanelSkinId | null;
  skinOverrides: SkinOverrides;
  backgroundEffect: string;
  backgroundTemplates: Record<string, number>;
}

export interface SkinPickSwitch {
  theme: Partial<SkinPickFields & { backgroundTemplate: number }>;
  patch: PanelDevicePatch;
}

// Skin to Skin is a no-op, so hopping between skins keeps the held values and the opacity set under Skin.
export function switchBackgroundMode(cur: SkinBackgroundFields, mode: PanelBackgroundMode): BackgroundSwitch {
  if (mode === 'skin') return cur.backgroundMode === 'skin' ? { theme: {}, patch: {} } : enterSkinBackground(cur);
  if (cur.backgroundMode === 'skin') return leaveSkinBackground(cur, mode);
  return { theme: { backgroundMode: mode, backgroundModeBefore: mode }, patch: { backgroundMode: mode } };
}

// The effect selection plus this panel's remembered preset for it.
export function selectBackgroundEffect(templates: Record<string, number>, effect: string) {
  return {
    backgroundEffect: effect,
    backgroundTemplate: normalizePanelBackgroundTemplate(templates[effect] ?? DEFAULT_PANEL_BACKGROUND_TEMPLATE),
  };
}

// A mode picked under a skin is also remembered for that skin.
export function chooseBackgroundMode(cur: SkinPickFields, mode: PanelBackgroundMode): SkinPickSwitch {
  const change = switchBackgroundMode(cur, mode);
  if (!cur.skin) return change;
  const skinOverrides = setSkinBackground(cur.skinOverrides, cur.skin, mode, cur.backgroundEffect);
  return { theme: { ...change.theme, skinOverrides }, patch: { ...change.patch, skinOverrides } };
}

// Picking a skin applies the background it remembers, Skin when none; removing it gives back what Skin replaced.
export function pickSkin(cur: SkinPickFields, skin: PanelSkinId | null): SkinPickSwitch {
  if (!skin) {
    const change = cur.backgroundMode === 'skin' ? leaveSkinBackground(cur) : { theme: {}, patch: {} };
    return { theme: { ...change.theme, skin: null }, patch: { ...change.patch, skin: '' } };
  }
  const saved = cur.skinOverrides[skin];
  const change = switchBackgroundMode(cur, saved?.backgroundMode ?? 'skin');
  const effect = saved?.backgroundEffect && saved.backgroundEffect !== cur.backgroundEffect
    ? selectBackgroundEffect(cur.backgroundTemplates, saved.backgroundEffect)
    : {};
  return { theme: { ...change.theme, ...effect, skin }, patch: { ...change.patch, ...effect, skin } };
}
