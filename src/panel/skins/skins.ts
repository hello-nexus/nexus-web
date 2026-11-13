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
  { id: 'pixel', label: 'Pixel', kind: 'style', font: 'pixel', fontLocked: true, accent: '#41a6f6', accentLocked: false, mode: 'dark', modeLocked: false, variants: [] },
  { id: 'lcd', label: 'LCD', kind: 'screen', font: 'jura', fontLocked: true, accent: null, accentLocked: true, mode: 'dark', modeLocked: true,
    variants: [{ id: 'green', label: 'Classic green', swatch: '#b4c19a' }, { id: 'blue', label: 'Blue backlight', swatch: '#2f6fe8' }, { id: 'orange', label: 'Orange backlight', swatch: '#f0902a' }] },
  { id: 'crt', label: 'CRT', kind: 'style', font: 'tektur', fontLocked: true, accent: '#33ff66', accentLocked: false, mode: 'dark', modeLocked: true, variants: [] },
  { id: 'vfd', label: 'VFD', kind: 'screen', font: 'jura', fontLocked: true, accent: null, accentLocked: true, mode: 'dark', modeLocked: true,
    variants: [{ id: 'teal', label: 'Teal', swatch: '#7dfff0' }, { id: 'blue', label: 'Blue', swatch: '#7fb4ff' }, { id: 'amber', label: 'Amber', swatch: '#ffc24d' }] },
  { id: 'hud', label: 'HUD', kind: 'style', font: 'tektur', fontLocked: false, accent: '#2fd8ff', accentLocked: false, mode: 'dark', modeLocked: false, variants: [] },
  { id: 'neon', label: 'Neon', kind: 'style', font: 'oswald', fontLocked: false, accent: '#ff2bd6', accentLocked: false, mode: 'dark', modeLocked: true, variants: [] },
  { id: 'blueprint', label: 'Blueprint', kind: 'style', font: 'jura', fontLocked: false, accent: '#1a4fa8', accentLocked: false, mode: 'dark', modeLocked: true, variants: [] },
  { id: 'eink', label: 'E-ink', kind: 'screen', font: 'piazzolla', fontLocked: false, accent: null, accentLocked: true, mode: 'light', modeLocked: true, variants: [] },
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
