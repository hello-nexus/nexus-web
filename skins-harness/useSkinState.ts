import { useCallback, useMemo, useState } from 'react';
import type { PanelFontId } from '../src/panel/theme/panelFont';
import { normalizePanelSkin, skinDef, type PanelSkinId, type SkinFont } from '../src/panel/skins/skins';

// The user's own panel settings (font, accent, mode) are never overwritten by
// a skin. Picking a skin applies its defaults as overrides; leaving the skin
// drops them, so the user's own values come straight back.
export interface SkinState {
  skin: PanelSkinId | null;
  variant: string | null;
  ownMode: 'dark' | 'light';
  ownFont: PanelFontId | null;
  ownAccent: string;
  ovFont: SkinFont | null;
  ovAccent: string | null;
}

export interface EffectiveSkin {
  skin: PanelSkinId | null;
  variant: string | null;
  mode: 'dark' | 'light';
  font: SkinFont | null;
  accent: string;
  fontLocked: boolean;
  accentLocked: boolean;
  modeLocked: boolean;
}

export const OWN_DEFAULT_ACCENT = '#2563eb';

export function readSkinState(): SkinState {
  const q = new URLSearchParams(location.search);
  const skin = normalizePanelSkin(q.get('skin'));
  const def = skinDef(skin);
  const v = q.get('variant');
  const font = q.get('font');
  const accent = q.get('accent');
  return {
    skin,
    variant: def?.variants.length ? (def.variants.find(x => x.id === v)?.id ?? def.variants[0].id) : null,
    ownMode: q.get('theme') === 'light' ? 'light' : 'dark',
    ownFont: (font as PanelFontId) || null,
    ownAccent: OWN_DEFAULT_ACCENT,
    ovFont: null,
    ovAccent: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : null,
  };
}

export function effective(s: SkinState): EffectiveSkin {
  const def = skinDef(s.skin);
  if (!def) {
    return { skin: null, variant: null, mode: s.ownMode, font: s.ownFont, accent: s.ownAccent, fontLocked: false, accentLocked: false, modeLocked: false };
  }
  return {
    skin: def.id,
    variant: s.variant,
    mode: def.modeLocked ? def.mode : s.ownMode,
    font: def.fontLocked ? def.font : (s.ovFont ?? def.font),
    accent: def.accentLocked || !def.accent ? (def.accent ?? s.ownAccent) : (s.ovAccent ?? def.accent),
    fontLocked: def.fontLocked,
    accentLocked: def.accentLocked,
    modeLocked: def.modeLocked,
  };
}

export function useSkinState() {
  const [s, setS] = useState<SkinState>(readSkinState);
  const eff = useMemo(() => effective(s), [s]);
  const setSkin = useCallback((id: PanelSkinId | null) => {
    const def = skinDef(id);
    setS(p => ({ ...p, skin: id, variant: def?.variants[0]?.id ?? null, ovFont: null, ovAccent: null }));
  }, []);
  const setVariant = useCallback((variant: string) => setS(p => ({ ...p, variant })), []);
  const setMode = useCallback((m: 'dark' | 'light') => setS(p => ({ ...p, ownMode: m })), []);
  const setFont = useCallback((f: PanelFontId) => setS(p => (p.skin ? { ...p, ovFont: f } : { ...p, ownFont: f })), []);
  const setAccent = useCallback((a: string) => setS(p => (p.skin ? { ...p, ovAccent: a } : { ...p, ownAccent: a })), []);
  return { state: s, eff, setSkin, setVariant, setMode, setFont, setAccent };
}
