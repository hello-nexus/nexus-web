import { panelFontVars, type PanelFont } from './panelFont';
import { normalizePanelSkin, skinAccentVars, skinDef, skinFontVars, type PanelSkinId, type SkinDef } from '../skins/skins';

// A panel skin is a preset layered over the user's own theme at render time:
// its font, accent and mode replace the stored ones only where the skin locks
// them (or the user never chose one), and the stored values are never written
// to, so they come straight back when the skin is set to None.

export interface SkinThemeFields {
  skin: PanelSkinId | null;
  themeSyncWithDesktop: boolean;
  themeMode: 'system' | 'dark' | 'light';
  accentSyncWithDesktop: boolean;
  accentColor: string;
  font: PanelFont | null;
}

// Null is the stock look. An unknown id reads as null (same rule as panelFont).
export function normalizeStoredSkin(value?: string | null): PanelSkinId | null {
  return normalizePanelSkin(value);
}

// The accent the user chose on this panel, if any. Synced or unset means the
// skin's own default applies.
function userAccent(theme: SkinThemeFields): string | null {
  return !theme.accentSyncWithDesktop && theme.accentColor ? theme.accentColor : null;
}

export interface ResolvedSkin {
  id: PanelSkinId;
  def: SkinDef;
  mode: 'dark' | 'light' | null;
  // 'pixel' or a panel font id or a system font value; what the panel draws in.
  font: string;
  accent: string | null;
}

export function resolveSkin(theme: SkinThemeFields): ResolvedSkin | null {
  const def = skinDef(theme.skin);
  if (!def || !theme.skin) return null;
  const font = def.fontLocked || !theme.font ? def.font : theme.font;
  const own = userAccent(theme);
  const accent = def.accent === null ? null : def.accentLocked ? def.accent : (own ?? def.accent);
  return {
    id: theme.skin,
    def,
    mode: def.modeLocked ? def.mode : null,
    font,
    accent,
  };
}

// Render-time overrides: a locked mode pins the panel to the skin's mode, and a
// style skin's accent replaces a synced or unset one. Applied to the effective
// theme only; the stored theme is not touched.
export function applyPanelSkin<T extends SkinThemeFields>(theme: T): T {
  const r = resolveSkin(theme);
  if (!r) return theme;
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
export type PanelSkinAttrs = Partial<Record<'data-panel-skin' | 'data-skin-overlay', string>>;

export function panelSkinAttrs(theme: SkinThemeFields): PanelSkinAttrs {
  const r = resolveSkin(theme);
  if (!r) return {};
  return { 'data-panel-skin': r.id, 'data-skin-overlay': 'on' };
}
