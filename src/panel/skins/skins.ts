// Panel skin registry (prototype). A skin is one attribute on the panel root,
// data-panel-skin="<id>", styled by src/panel/skins/<id>.scss, and a preset:
// it carries a default font, accent and mode, and says which of them the user
// may still change. Screen-type skins (LCD, CRT, VFD, E-ink) use fixed
// material colours with a small variant set; style skins (Pixel, HUD, Neon,
// Blueprint) take the panel accent.

import { PANEL_FONTS, panelFontVars, type PanelFontId } from '../theme/panelFont';

// Skins draw only in faces the panel already ships (PANEL_FONTS); nothing is
// added to the bundle.
export type SkinFont = PanelFontId | 'pixel';

export interface SkinVariant { id: string; label: string; swatch: string }

export interface SkinDef {
  id: string;
  label: string;
  kind: 'screen' | 'style';
  font: SkinFont;
  fontLocked: boolean;
  // Style skins only: the default accent; screen skins use variants instead.
  accent: string | null;
  accentLocked: boolean;
  // The mode the skin is drawn in. With modeLocked the dark/light setting is ignored.
  mode: 'dark' | 'light';
  modeLocked: boolean;
  variants: readonly SkinVariant[];
}

export const PANEL_SKINS = [
  { id: 'pixel', label: 'Pixel', kind: 'style', font: 'pixel', fontLocked: true, accent: '#41a6f6', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'lcd', label: 'LCD', kind: 'style', font: 'jura', fontLocked: true, accent: '#9bb36a', accentLocked: false, mode: 'light', modeLocked: false },
  { id: 'crt', label: 'CRT', kind: 'style', font: 'tektur', fontLocked: true, accent: '#33ff66', accentLocked: false, mode: 'dark', modeLocked: true },
  { id: 'vfd', label: 'VFD', kind: 'style', font: 'jura', fontLocked: true, accent: '#3fd9c8', accentLocked: false, mode: 'dark', modeLocked: true },
  { id: 'hud', label: 'HUD', kind: 'style', font: 'tektur', fontLocked: false, accent: '#2fd8ff', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'neon', label: 'Neon', kind: 'style', font: 'oswald', fontLocked: false, accent: '#ff2bd6', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'blueprint', label: 'Blueprint', kind: 'style', font: 'jura', fontLocked: false, accent: '#1a4fa8', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'eink', label: 'E-ink', kind: 'screen', font: 'piazzolla', fontLocked: false, accent: null, accentLocked: true, mode: 'light', modeLocked: false },
  { id: 'bevel', label: 'Bevel', kind: 'style', font: 'lexend', fontLocked: false, accent: '#6f9bff', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'hifi', label: 'Hi-fi', kind: 'style', font: 'oswald', fontLocked: false, accent: '#e2572b', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'cockpit', label: 'Cockpit', kind: 'style', font: 'jura', fontLocked: false, accent: '#ffb000', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'arcade', label: 'Arcade', kind: 'style', font: 'tektur', fontLocked: false, accent: '#ff3b30', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'glass', label: 'Glass', kind: 'style', font: 'lexend', fontLocked: false, accent: '#5aa8ff', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'holo', label: 'Holo', kind: 'style', font: 'jura', fontLocked: false, accent: '#7df9ff', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'mecha', label: 'Mecha', kind: 'style', font: 'tektur', fontLocked: false, accent: '#ff7a00', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'steampunk', label: 'Steampunk', kind: 'style', font: 'piazzolla', fontLocked: false, accent: '#ffb84a', accentLocked: true, mode: 'dark', modeLocked: false },
  { id: 'nixie', label: 'Nixie', kind: 'style', font: 'jura', fontLocked: false, accent: '#ff8a2a', accentLocked: true, mode: 'dark', modeLocked: true },
  { id: 'deco', label: 'Art Deco', kind: 'style', font: 'oswald', fontLocked: false, accent: '#c9a24a', accentLocked: true, mode: 'dark', modeLocked: false },
  { id: 'swiss', label: 'Swiss', kind: 'style', font: 'lexend', fontLocked: false, accent: '#e30613', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'clay', label: 'Clay', kind: 'style', font: 'lexend', fontLocked: false, accent: '#7a5af8', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'sketch', label: 'Sketch', kind: 'style', font: 'piazzolla', fontLocked: false, accent: '#d9532b', accentLocked: false, mode: 'dark', modeLocked: false },
  { id: 'comic', label: 'Comic', kind: 'style', font: 'oswald', fontLocked: false, accent: '#e8222f', accentLocked: false, mode: 'dark', modeLocked: false },
] as const satisfies readonly SkinDef[];

export type PanelSkinId = (typeof PANEL_SKINS)[number]['id'];

export function skinDef(id: PanelSkinId | null): SkinDef | null {
  return (PANEL_SKINS as readonly SkinDef[]).find(s => s.id === id) ?? null;
}

// Null is the stock look; an unknown id reads as null (same rule as panelFont).
export function normalizePanelSkin(value?: string | null): PanelSkinId | null {
  return PANEL_SKINS.find(s => s.id === value)?.id ?? null;
}

export function skinFontLabel(font: SkinFont): string {
  if (font === 'pixel') return 'Pixelify Sans';
  return PANEL_FONTS.find(f => f.id === font)?.family ?? 'Lexend';
}

// Root vars for a font choice: the existing panel font override.
export function skinFontVars(font: SkinFont | null): Record<string, string> {
  if (font === 'pixel') {
    // Same tail as panelFontStack, so CJK and missing glyphs fall through to
    // Lexend and the system fonts exactly as the panel fonts do.
    const stack = "'Twemoji Country Flags', 'Skin Pixel', 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
    return { '--panel-font': stack, '--font-sans': stack };
  }
  return panelFontVars(font);
}

// ---- accent helpers -------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// Neon's second tile colour: the accent's hue rotated by a third of the wheel.
export function derivedSecondColor(hex: string): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb((h + 150) % 360, Math.max(s, 0.8), Math.min(Math.max(l, 0.5), 0.6)));
}

// Pixel keeps to its 16-colour palette: the accent snaps to the nearest entry.
export const PIXEL_PALETTE = ['#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#41a6f6', '#3b5dc9', '#73eff7', '#f4f4f4'] as const;
export function snapToPixelPalette(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let best: string = PIXEL_PALETTE[0];
  let bestD = Infinity;
  for (const c of PIXEL_PALETTE) {
    const [cr, cg, cb] = hexToRgb(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function deepened(hex: string): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb(h, s, Math.min(l, 0.36)));
}

// Vars a style skin reads; --skin-accent2 only matters for Neon.
export function skinAccentVars(id: PanelSkinId, accent: string): Record<string, string> {
  const a = id === 'pixel' ? snapToPixelPalette(accent) : accent;
  const second = derivedSecondColor(a);
  if (id === 'crt') return crtPhosphorVars(a);
  if (id === 'lcd' || id === 'vfd') return segmentDisplayVars(a);
  return {
    '--skin-accent': a,
    '--skin-accent-rgb': hexToRgb(a).join(', '),
    '--skin-accent2': second,
    '--skin-accent2-rgb': hexToRgb(second).join(', '),
    // The accent darkened for text and lines on a light panel.
    '--skin-accent-deep': deepened(a),
  };
}

// CRT: every colour derives from the accent. Ink lightness is clamped so a dark
// blue or dark red accent still reads on the near-black glass; the glass takes
// a faint tint of the same hue.
export function crtPhosphorVars(accent: string): Record<string, string> {
  const [h, s0, l0] = rgbToHsl(hexToRgb(accent));
  const s = Math.max(s0, 0.55);
  const ink = rgbToHex(hslToRgb(h, s, Math.max(l0, 0.68)));
  const dim = rgbToHex(hslToRgb(h, s * 0.9, 0.62));
  const bg = rgbToHex(hslToRgb(h, Math.min(s, 0.8), 0.06));
  const back = rgbToHex(hslToRgb(h, Math.min(s, 0.6), 0.02));
  return {
    '--skin-ink': ink,
    '--skin-ink-rgb': hexToRgb(ink).join(', '),
    '--skin-dim': dim,
    '--skin-bg': bg,
    '--skin-back': back,
  };
}

// LCD and VFD: one accent, every material colour derived from its hue. Lit ink
// is clamped light enough for a black cell, the reflective cell stays pale and
// its ink dark, so any accent stays legible in both modes.
export function segmentDisplayVars(accent: string): Record<string, string> {
  const [h, s0] = rgbToHsl(hexToRgb(accent));
  const hex = (sat: number, l: number) => rgbToHex(hslToRgb(h, sat, l));
  const rgb = (c: string) => hexToRgb(c).join(', ');
  const lit = hex(Math.max(s0, 0.6), 0.68);
  const deep = hex(Math.min(Math.max(s0, 0.25), 0.5), 0.1);
  return {
    '--skin-lit': lit,
    '--skin-lit-rgb': rgb(lit),
    '--skin-deep': deep,
    '--skin-deep-rgb': rgb(deep),
    '--skin-pale': hex(Math.min(Math.max(s0, 0.2), 0.4), 0.72),
    '--skin-day-back': hex(Math.min(s0, 0.2), 0.15),
    '--skin-night': hex(Math.min(s0, 0.7), 0.08),
    '--skin-night-back': hex(Math.min(s0, 0.6), 0.025),
  };
}
