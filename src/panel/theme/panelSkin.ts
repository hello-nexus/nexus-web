import type { PanelBackgroundBase, PanelBackgroundMode } from '../background/panelBackground';
import { PANEL_FONTS, panelFontVars, type PanelFont } from './panelFont';
import type { SkinOverrides } from '../skins/skinOverrides';
import { normalizePanelSkin, skinAccentVars, skinDef, type PanelSkinId, type SkinDef } from '../skins/skins';

// A skin is a preset layered over the user's theme at render time; accent and font picked while it is active are remembered per skin, so None restores the user's own.

export interface SkinThemeFields {
  skin: PanelSkinId | null;
  accentSyncWithDesktop: boolean;
  accentColor: string;
  font: PanelFont | null;
  widgetOpacity: number;
  skinOverrides: SkinOverrides;
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
  // A panel font id or a system font value; what the panel draws in.
  font: string;
  accent: string;
}

export function resolveSkin(theme: SkinThemeFields): ResolvedSkin | null {
  const def = skinDef(theme.skin);
  if (!def || !theme.skin) return null;
  const override = theme.skinOverrides[theme.skin];
  const font = override?.font ?? def.font;
  const accent = override?.accent ?? def.accent;
  return {
    id: theme.skin,
    def,
    font,
    accent,
  };
}

// The Skin background chip belongs to the active skin, never to the selected
// mode, so picking another mode leaves it in place.
export function offersSkinBackground(theme: SkinThemeFields): boolean {
  return resolveSkin(theme) !== null;
}

// Render-time override: the skin's accent replaces a synced or unset one. The stored theme is not touched.
export function applyPanelSkin<T extends SkinThemeFields>(theme: T): T {
  const r = resolveSkin(theme);
  // Without a skin there is no skin backdrop: back to the mode held before it.
  if (!r) return theme.backgroundMode === 'skin' ? { ...theme, backgroundMode: theme.backgroundModeBefore } : theme;
  return {
    ...theme,
    accentSyncWithDesktop: false,
    accentColor: r.accent,
  };
}

// Panel-root variables the skin adds: the font override and the accent family its stylesheet reads.
export function panelSkinVars(theme: SkinThemeFields, accentHex: string): Record<string, string> {
  const r = resolveSkin(theme);
  if (!r) return {};
  return { ...panelFontVars(r.font as PanelFont, true), ...skinAccentVars(r.id, accentHex) };
}

// Attributes a panel root carries for the skin stylesheets.
export type PanelSkinAttrs = Partial<Record<'data-panel-skin' | 'data-skin-overlay' | 'data-skin-card-faded' | 'data-skin-frameless' | 'data-skin-font-custom', string>>;

export function panelSkinAttrs(theme: SkinThemeFields): PanelSkinAttrs {
  const r = resolveSkin(theme);
  if (!r) return {};
  // Card outer shadows cannot scale with widget opacity; they drop out once the widgets are mostly faded.
  return {
    'data-panel-skin': r.id,
    'data-skin-overlay': 'on',
    ...(theme.widgetOpacity < 0.5 ? { 'data-skin-card-faded': '' } : {}),
    ...(r.def.framelessAtZeroPadding ? { 'data-skin-frameless': '' } : {}),
    // The segment skins draw numerals in their own face only while the user keeps the skin's font.
    ...(r.font !== r.def.font ? { 'data-skin-font-custom': '' } : {}),
  };
}

// The embedded font the panel root draws in (skin font included), for font-scoped CSS; none for a system font.
export function panelFontAttrs(theme: SkinThemeFields): { 'data-panel-font'?: string } {
  const font = resolveSkin(theme)?.font ?? theme.font;
  const id = PANEL_FONTS.find(f => f.id === font)?.id;
  return id ? { 'data-panel-font': id } : {};
}
