import type { PanelBackgroundBase, PanelBackgroundMode } from '../background/panelBackground';
import { panelFontVars, type PanelFont } from './panelFont';
import { normalizePanelSkin, skinAccentVars, skinDef, skinFontVars, type PanelSkinId, type SkinDef } from '../skins/skins';

// A panel skin is a preset layered over the user's own theme at render time:
// picking one applies the skin's own font, accent and mode. A choice the user
// makes while the skin is active is stored as a skin-level override (cleared
// on every skin change) and never in their own accent, font or mode, so None
// brings those straight back. A locked value ignores the override.

export interface SkinThemeFields {
  skin: PanelSkinId | null;
  themeSyncWithDesktop: boolean;
  themeMode: 'system' | 'dark' | 'light';
  accentSyncWithDesktop: boolean;
  accentColor: string;
  font: PanelFont | null;
  widgetOpacity: number;
  skinAccent: string | null;
  skinFont: string | null;
  backgroundMode: PanelBackgroundMode;
  // The mode the background falls back to when a Skin background has no skin.
  backgroundModeBefore: PanelBackgroundBase;
}

// Null is the stock look. An unknown id reads as null (same rule as panelFont).
export function normalizeStoredSkin(value?: string | null): PanelSkinId | null {
  return normalizePanelSkin(value);
}

export interface ResolvedSkin {
  id: PanelSkinId;
  def: SkinDef;
  // Set only for a skin that pins the panel's mode; null follows the normal Theme controls.
  mode: 'dark' | 'light' | null;
  // 'pixel' or a panel font id or a system font value; what the panel draws in.
  font: string;
  accent: string | null;
}

export function resolveSkin(theme: SkinThemeFields): ResolvedSkin | null {
  const def = skinDef(theme.skin);
  if (!def || !theme.skin) return null;
  const font = def.fontLocked ? def.font : (theme.skinFont ?? def.font);
  const accent = def.accent === null ? null : def.accentLocked ? def.accent : (theme.skinAccent ?? def.accent);
  return {
    id: theme.skin,
    def,
    mode: def.modeLocked ? def.mode : null,
    font,
    accent,
  };
}

// The Skin background chip belongs to the active skin, never to the selected
// mode, so picking another mode leaves it in place.
export function offersSkinBackground(theme: SkinThemeFields): boolean {
  return resolveSkin(theme) !== null;
}

// Render-time overrides: a locked mode pins the panel to the skin's mode, and a
// style skin's accent replaces a synced or unset one. Applied to the effective
// theme only; the stored theme is not touched.
export function applyPanelSkin<T extends SkinThemeFields>(theme: T): T {
  const r = resolveSkin(theme);
  // Without a skin there is no skin backdrop: back to the mode held before it.
  if (!r) return theme.backgroundMode === 'skin' ? { ...theme, backgroundMode: theme.backgroundModeBefore } : theme;
  return {
    ...theme,
    ...(r.mode ? { themeSyncWithDesktop: false, themeMode: r.mode } : {}),
    ...(r.accent ? { accentSyncWithDesktop: false, accentColor: r.accent } : {}),
  };
}

// Panel-root variables the skin adds: the font override and, for a style
// skin, the accent family its stylesheet reads.
export function panelSkinVars(theme: SkinThemeFields, accentHex: string): Record<string, string> {
  const r = resolveSkin(theme);
  if (!r) return {};
  const font = r.font === 'pixel' ? skinFontVars('pixel') : panelFontVars(r.font as PanelFont);
  return { ...font, ...(r.accent ? skinAccentVars(r.id, accentHex) : {}) };
}

// Attributes a panel root carries for the skin stylesheets.
export type PanelSkinAttrs = Partial<Record<'data-panel-skin' | 'data-skin-overlay' | 'data-skin-card-faded' | 'data-skin-frameless', string>>;

export function panelSkinAttrs(theme: SkinThemeFields): PanelSkinAttrs {
  const r = resolveSkin(theme);
  if (!r) return {};
  // Card outer shadows cannot scale with widget opacity; they drop out below half.
  return {
    'data-panel-skin': r.id,
    'data-skin-overlay': 'on',
    ...(theme.widgetOpacity < 0.5 ? { 'data-skin-card-faded': '' } : {}),
    ...(r.def.framelessAtZeroPadding ? { 'data-skin-frameless': '' } : {}),
  };
}
