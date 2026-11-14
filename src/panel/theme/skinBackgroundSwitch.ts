import type { PanelDevicePatch } from '../../api/panel';
import {
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundTemplate,
  skinBackgroundHeld,
  type PanelBackdrop,
  type PanelBackgroundBase,
  type PanelBackgroundMode,
  type SkinBackgroundHeld,
} from '../background/panelBackground';
import { setSkinBackground, type SkinOverrides } from '../skins/skinOverrides';
import type { PanelSkinId } from '../skins/skins';

// The background fields a skin takes over, and the pre-skin values it must give back.
export interface SkinBackgroundFields {
  skin: PanelSkinId | null;
  skinOverrides: SkinOverrides;
  backgroundMode: PanelBackgroundMode;
  backgroundModeBefore: PanelBackgroundBase;
  backdrop: PanelBackdrop;
  backgroundFrost: number;
  backgroundOpacity: number;
  backgroundHeld?: SkinBackgroundHeld | null;
  backgroundEffect: string;
  backgroundTemplates: Record<string, number>;
}

export interface BackgroundSwitch {
  theme: Partial<SkinBackgroundFields & { backgroundTemplate: number }>;
  patch: PanelDevicePatch;
}

interface Hold {
  before: PanelBackgroundBase;
  held: SkinBackgroundHeld | null;
}

// The effect selection plus this panel's remembered preset for it.
export function selectBackgroundEffect(templates: Record<string, number>, effect: string) {
  return {
    backgroundEffect: effect,
    backgroundTemplate: normalizePanelBackgroundTemplate(templates[effect] ?? DEFAULT_PANEL_BACKGROUND_TEMPLATE),
  };
}

// Captured when a skin goes on and kept through every hop. A skinned record stored before the hold existed captures on its next switch.
function holdFor(cur: SkinBackgroundFields): Hold {
  if (cur.backgroundMode === 'skin' || (cur.skin && cur.backgroundHeld)) return { before: cur.backgroundModeBefore, held: cur.backgroundHeld ?? null };
  return {
    before: cur.backgroundMode,
    held: { backdrop: cur.backdrop, frost: cur.backgroundFrost, opacity: cur.backgroundOpacity, effect: cur.backgroundEffect },
  };
}

// The live fields for showing `mode` under a skin. Skin resets frost and opacity (only opacity stays editable
// there); leaving it gives back the held frost and opacity, and the backdrop when the mode is the held one.
function showMode(cur: SkinBackgroundFields, mode: PanelBackgroundMode, { before, held }: Hold): BackgroundSwitch['theme'] {
  if (mode === 'skin') {
    return cur.backgroundMode === 'skin' ? {} : { backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1 };
  }
  if (cur.backgroundMode !== 'skin' || !held) return { backgroundMode: mode };
  const restoresBackdrop = mode === before;
  // A non-theme backdrop stays opaque, so a mode that does not bring it back does not inherit its opacity.
  const opacity = !restoresBackdrop && held.backdrop !== 'theme' ? 1 : held.opacity;
  return { backgroundMode: mode, backdrop: restoresBackdrop ? held.backdrop : cur.backdrop, backgroundFrost: held.frost, backgroundOpacity: opacity };
}

function toPatch(theme: BackgroundSwitch['theme']): PanelDevicePatch {
  return {
    ...(theme.backdrop !== undefined ? { backdrop: theme.backdrop } : {}),
    ...(theme.backgroundFrost !== undefined ? { backgroundFrostLevel: theme.backgroundFrost } : {}),
    ...(theme.backgroundOpacity !== undefined ? { backgroundOpacity: theme.backgroundOpacity } : {}),
    ...(theme.backgroundEffect !== undefined ? { backgroundEffect: theme.backgroundEffect } : {}),
    ...(theme.backgroundTemplate !== undefined ? { backgroundTemplate: theme.backgroundTemplate } : {}),
  };
}

// Shows `mode` under the skin being applied, and stores the hold alongside it in the record's mode string.
function underSkin(cur: SkinBackgroundFields, mode: PanelBackgroundMode, effect: string | undefined): BackgroundSwitch {
  const hold = holdFor(cur);
  const live = showMode(cur, mode, hold);
  const picked = effect && effect !== cur.backgroundEffect ? selectBackgroundEffect(cur.backgroundTemplates, effect) : {};
  const stored = encodeSkinBackgroundMode(live.backgroundMode ?? cur.backgroundMode, hold.before, hold.held);
  const theme = { ...live, ...picked, backgroundModeBefore: hold.before, backgroundHeld: skinBackgroundHeld(stored) };
  return { theme, patch: { ...toPatch(theme), backgroundMode: stored } };
}

// Gives back exactly the background held when the first skin went on.
function restoreHeld(cur: SkinBackgroundFields): BackgroundSwitch {
  const { before, held } = holdFor(cur);
  const theme: BackgroundSwitch['theme'] = {
    backgroundMode: before,
    backgroundModeBefore: before,
    backgroundHeld: null,
    ...(held ? { backdrop: held.backdrop, backgroundFrost: held.frost, backgroundOpacity: held.opacity } : {}),
    ...(held?.effect && held.effect !== cur.backgroundEffect ? selectBackgroundEffect(cur.backgroundTemplates, held.effect) : {}),
  };
  return { theme, patch: { ...toPatch(theme), backgroundMode: before } };
}

// A mode picked under a skin is also remembered for that skin.
export function chooseBackgroundMode(cur: SkinBackgroundFields, mode: PanelBackgroundMode): BackgroundSwitch {
  if (!cur.skin) {
    if (mode === 'skin') return underSkin(cur, mode, undefined);
    return { theme: { backgroundMode: mode, backgroundModeBefore: mode, backgroundHeld: null }, patch: { backgroundMode: mode } };
  }
  const change = underSkin(cur, mode, undefined);
  const skinOverrides = setSkinBackground(cur.skinOverrides, cur.skin, mode, cur.backgroundEffect);
  return { theme: { ...change.theme, skinOverrides }, patch: { ...change.patch, skinOverrides } };
}

// Picking a skin applies the background it remembers, Skin when none; removing it restores the pre-skin background.
export function pickSkin(cur: SkinBackgroundFields, skin: PanelSkinId | null): BackgroundSwitch {
  if (!skin) {
    const change = cur.skin || cur.backgroundMode === 'skin' ? restoreHeld(cur) : { theme: {}, patch: {} };
    return { theme: { ...change.theme, skin: null }, patch: { ...change.patch, skin: '' } };
  }
  const saved = cur.skinOverrides[skin];
  const change = underSkin(cur, saved?.backgroundMode ?? 'skin', saved?.backgroundEffect);
  return { theme: { ...change.theme, skin }, patch: { ...change.patch, skin } };
}
