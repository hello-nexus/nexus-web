// Panel skin registry (prototype). A skin is one attribute on the panel root,
// data-panel-skin="<id>", styled by src/panel/skins/<id>.scss, and a preset:
// it carries a default font, accent and mode, and says which of them the user
// may still change.

import { PANEL_FONTS, panelFontVars, type PanelFontId } from '../theme/panelFont';

// Skins draw only in faces the panel already ships (PANEL_FONTS); nothing is
// added to the bundle.
export type SkinFont = PanelFontId | 'pixel';

export interface SkinDef {
  id: string;
  label: string;
  kind: 'screen' | 'style';
  font: SkinFont;
  fontLocked: boolean;
  // Style skins only: the default accent.
  accent: string | null;
  accentLocked: boolean;
  // The mode the skin is drawn in. With modeLocked the dark/light setting is ignored.
  mode: 'dark' | 'light';
  modeLocked: boolean;
  // Picking the skin switches the background mode to Skin (its own backdrop); the user can pick any other mode.
  prefersSkinBackground: boolean;
  // At 0% widget padding the frame decorations are not drawn and the inset is 0. Skins whose frame is their identity keep it.
  framelessAtZeroPadding: boolean;
}

export const PANEL_SKINS = [
  { id: 'pixel', label: 'Pixel', kind: 'style', font: 'pixel', fontLocked: true, accent: '#41a6f6', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'lcd', label: 'LCD', kind: 'style', font: 'jura', fontLocked: true, accent: '#9bb36a', accentLocked: false, mode: 'light', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: false },
  { id: 'crt', label: 'CRT', kind: 'style', font: 'tektur', fontLocked: true, accent: '#33ff66', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: true },
  { id: 'vfd', label: 'VFD', kind: 'style', font: 'jura', fontLocked: true, accent: '#3fd9c8', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: true },
  { id: 'hud', label: 'HUD', kind: 'style', font: 'tektur', fontLocked: false, accent: '#2fd8ff', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'neon', label: 'Neon', kind: 'style', font: 'oswald', fontLocked: false, accent: '#ff2bd6', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'blueprint', label: 'Blueprint', kind: 'style', font: 'jura', fontLocked: false, accent: '#1a4fa8', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: true },
  { id: 'eink', label: 'E-ink', kind: 'screen', font: 'piazzolla', fontLocked: false, accent: '#2f6fd6', accentLocked: false, mode: 'light', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: true },
  { id: 'bevel', label: 'Bevel', kind: 'style', font: 'lexend', fontLocked: false, accent: '#6f9bff', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'hifi', label: 'Hi-fi', kind: 'style', font: 'oswald', fontLocked: false, accent: '#e2572b', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'cockpit', label: 'Cockpit', kind: 'style', font: 'jura', fontLocked: false, accent: '#ffb000', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'arcade', label: 'Arcade', kind: 'style', font: 'tektur', fontLocked: false, accent: '#ff3b30', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'glass', label: 'Glass', kind: 'style', font: 'lexend', fontLocked: false, accent: '#5aa8ff', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'mecha', label: 'Mecha', kind: 'style', font: 'tektur', fontLocked: false, accent: '#ff7a00', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'steampunk', label: 'Steampunk', kind: 'style', font: 'piazzolla', fontLocked: false, accent: '#ffb84a', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'nixie', label: 'Nixie', kind: 'style', font: 'jura', fontLocked: false, accent: '#ff8a2a', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: true, framelessAtZeroPadding: false },
  { id: 'deco', label: 'Art Deco', kind: 'style', font: 'oswald', fontLocked: false, accent: '#c9a24a', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
  { id: 'swiss', label: 'Swiss', kind: 'style', font: 'lexend', fontLocked: false, accent: '#e30613', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'clay', label: 'Clay', kind: 'style', font: 'lexend', fontLocked: false, accent: '#7a5af8', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'sketch', label: 'Sketch', kind: 'style', font: 'piazzolla', fontLocked: false, accent: '#d9532b', accentLocked: false, mode: 'dark', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'bubblegum', label: 'Bubblegum', kind: 'style', font: 'lexend', fontLocked: false, accent: '#ff4fa3', accentLocked: false, mode: 'light', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'sakura', label: 'Sakura', kind: 'style', font: 'piazzolla', fontLocked: false, accent: '#e8799a', accentLocked: false, mode: 'light', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: true },
  { id: 'track', label: 'Track', kind: 'style', font: 'oswald', fontLocked: false, accent: '#1e6bff', accentLocked: false, mode: 'light', modeLocked: false, prefersSkinBackground: false, framelessAtZeroPadding: false },
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
    const stack = "'Twemoji Country Flags', 'Skin Pixel Digits', 'Skin Pixel', 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
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

// The accent darkened for text and lines on a light panel: lightness steps down
// until the colour's luminance is low enough for 4.5:1 on the lighter card fills
// (parchment included), however bright the accent started.
function deepened(hex: string): string {
  const [h, s, l0] = rgbToHsl(hexToRgb(hex));
  let l = Math.min(l0, 0.36);
  while (l > 0.1 && relLum(hslToRgb(h, s, l)) > 0.11) l -= 0.01;
  return rgbToHex(hslToRgb(h, s, l));
}

// Vars a style skin reads; --skin-accent2 only matters for Neon.
export function skinAccentVars(id: PanelSkinId, accent: string): Record<string, string> {
  const a = id === 'pixel' ? snapToPixelPalette(accent) : accent;
  const second = derivedSecondColor(a);
  if (id === 'crt') return crtPhosphorVars(a);
  if (id === 'lcd' || id === 'vfd') return segmentDisplayVars(a);
  if (id === 'eink') return einkVars(a);
  return {
    '--skin-accent': a,
    '--skin-accent-rgb': hexToRgb(a).join(', '),
    '--skin-accent2': second,
    '--skin-accent2-rgb': hexToRgb(second).join(', '),
    // The accent darkened for text and lines on a light panel.
    '--skin-accent-deep': deepened(a),
    ...(id in SURFACE_SPECS ? skinSurfaceVars(id as keyof typeof SURFACE_SPECS, a) : {}),
    ...(id in BACKDROP_BASE ? skinBackdropVars(id as keyof typeof BACKDROP_BASE, a) : {}),
    ...(id === 'deco' || id === 'steampunk' || id === 'nixie' ? metalVars(a) : {}),
  };
}

// Skins whose palette follows the accent: every surface, ink and line takes the
// accent's hue, so a new accent recolours the whole skin. Per skin: surface
// saturation, then lightness of the backdrop, card and line for each mode.
export const SURFACE_SPECS = {
  bubblegum: { sat: 0.85, light: { back: 0.91, card: 0.975, line: 0.8 }, dark: { back: 0.12, card: 0.17, line: 0.34 } },
  sakura: { sat: 0.55, light: { back: 0.94, card: 0.985, line: 0.84 }, dark: { back: 0.13, card: 0.19, line: 0.38 } },
  track: { sat: 0.28, light: { back: 0.91, card: 0.99, line: 0.78 }, dark: { back: 0.09, card: 0.15, line: 0.32 } },
  deco: { sat: 0.35, light: { back: 0.83, card: 0.95, line: 0.5 }, dark: { back: 0.03, card: 0.06, line: 0.5 } },
  steampunk: { sat: 0.5, light: { back: 0.66, card: 0.84, line: 0.45 }, dark: { back: 0.06, card: 0.12, line: 0.35 } },
  nixie: { sat: 0.45, light: { back: 0.72, card: 0.91, line: 0.45 }, dark: { back: 0.03, card: 0.06, line: 0.3 } },
} as const;

// The panel backdrop of every other skin keeps its own lightness and takes the
// accent's hue, so the skin background recolours with the accent. Skins whose
// backdrop is already drawn from the accent (CRT, VFD, LCD, dark Blueprint) are
// not listed.
export const BACKDROP_BASE = {
  pixel: { light: '#94b0c2', dark: '#1a1c2c' },
  hud: { light: '#dbe9f0', dark: '#040d16' },
  neon: { light: '#fff2fb', dark: '#0c0618' },
  blueprint: { light: '#f4f2ea', dark: '#000000' },
  eink: { light: '#d9d6cb', dark: '#000000', floor: 0.06 },
  bevel: { light: '#7d8794', dark: '#2b2e35' },
  hifi: { light: '#b5b8bc', dark: '#171717' },
  cockpit: { light: '#b9bdc1', dark: '#050506' },
  arcade: { light: '#efe7d2', dark: '#12052a' },
  glass: { light: '#dfe8fb', dark: '#0d1230' },
  mecha: { light: '#a7adb3', dark: '#16181b' },
  swiss: { light: '#e9e9e6', dark: '#0c0c0c' },
  clay: { light: '#ece4dc', dark: '#2a2733' },
  sketch: { light: '#e4ddc8', dark: '#26282c' },
} as const;

export function skinBackdropVars(id: keyof typeof BACKDROP_BASE, accent: string): Record<string, string> {
  const base = BACKDROP_BASE[id];
  const floor = 'floor' in base ? base.floor : 0.12;
  const [h, s0] = rgbToHsl(hexToRgb(accent));
  const out: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as const) {
    const [, s, l] = rgbToHsl(hexToRgb(base[mode]));
    out[`--skin-bd-${mode}`] = rgbToHex(hslToRgb(h, s0 < 0.1 ? 0 : Math.min(Math.max(s, floor), 0.85), l));
  }
  return out;
}

// Metal for the brass and gold skins: three steps of the accent hue, so a new accent gives a new alloy.
export function metalVars(accent: string): Record<string, string> {
  const [h, s0] = rgbToHsl(hexToRgb(accent));
  const s = Math.min(Math.max(s0, 0.45), 0.8);
  const hex = (l: number) => rgbToHex(hslToRgb(h, s, l));
  const mid = hex(0.52);
  const deep = hex(0.36);
  return {
    '--skin-metal-hi': hex(0.78),
    '--skin-metal-mid': mid,
    '--skin-metal-lo': hex(0.26),
    '--skin-metal-rgb': hexToRgb(mid).join(', '),
    '--skin-metal-deep': deep,
    '--skin-metal-deep-rgb': hexToRgb(deep).join(', '),
  };
}

// Secondary ink: starts mid-tone and steps away from the surfaces until it
// reads at 4.7:1 on both the card and the backdrop.
function dimInk(h: number, s: number, l0: number, towardDark: boolean, surfaces: [number, number, number][], min = 4.7): string {
  let l = l0;
  for (let i = 0; i < 80; i++) {
    const c = hslToRgb(h, s, l);
    if (surfaces.every(sf => contrastRatio(c, sf) >= min)) break;
    l += towardDark ? -0.01 : 0.01;
    if (l < 0 || l > 1) break;
  }
  return rgbToHex(hslToRgb(h, s, Math.min(Math.max(l, 0), 1)));
}

export function skinSurfaceVars(id: keyof typeof SURFACE_SPECS, accent: string): Record<string, string> {
  const spec = SURFACE_SPECS[id];
  const [h, s0] = rgbToHsl(hexToRgb(accent));
  const sat = s0 < 0.1 ? 0 : spec.sat;
  const out: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as const) {
    const m = spec[mode];
    const back = hslToRgb(h, sat, m.back);
    const card = hslToRgb(h, sat, m.card);
    const text = hslToRgb(h, sat * 0.6, mode === 'light' ? 0.13 : 0.96);
    const line = hslToRgb(h, sat, m.line);
    const dim = dimInk(h, sat * 0.5, mode === 'light' ? 0.32 : 0.78, mode === 'light', [back, card]);
    const put = (name: string, c: [number, number, number] | string) => {
      const hex = typeof c === 'string' ? c : rgbToHex(c);
      out[`--skin-sf-${name}-${mode}`] = hex;
      if (name === 'text' || name === 'line') out[`--skin-sf-${name}-rgb-${mode}`] = hexToRgb(hex).join(', ');
    };
    put('back', back); put('card', card); put('text', text); put('line', line); put('dim', dim);
  }
  // Blossom and sprinkle hues, one pastel step off the accent.
  out['--skin-petal-rgb'] = hslToRgb(h, 0.75, 0.72).map(Math.round).join(', ');
  out['--skin-dot-a-rgb'] = hslToRgb((h + 320) % 360, 0.8, 0.72).map(Math.round).join(', ');
  out['--skin-dot-b-rgb'] = hslToRgb((h + 40) % 360, 0.8, 0.74).map(Math.round).join(', ');
  return out;
}

// CRT: every colour derives from the accent. Ink lightness is clamped so a dark
// blue or dark red accent still reads on the near-black glass; the glass takes
// a faint tint of the same hue.
// CRT in light mode is reverse video: warm-grey glass with dark phosphor-hued ink.
function crtPaperVars(h: number, s: number): Record<string, string> {
  const bg = '#e6e3da';
  const back = '#cdc9bd';
  const surfaces = [hexToRgb(bg), hexToRgb(back)];
  const ink = dimInk(h, Math.min(s, 0.8), 0.3, true, surfaces, 7);
  const dim = dimInk(h, Math.min(s, 0.7), 0.36, true, surfaces, 5);
  return {
    '--crt-paper-bg': bg,
    '--crt-paper-back': back,
    '--crt-paper-ink': ink,
    '--crt-paper-ink-rgb': hexToRgb(ink).join(', '),
    '--crt-paper-dim': dim,
  };
}

export function crtPhosphorVars(accent: string): Record<string, string> {
  const [h, s0, l0] = rgbToHsl(hexToRgb(accent));
  const s = Math.max(s0, 0.55);
  const ink = rgbToHex(hslToRgb(h, s, Math.max(l0, 0.68)));
  const dim = rgbToHex(hslToRgb(h, s * 0.9, 0.62));
  const bg = rgbToHex(hslToRgb(h, Math.min(s, 0.8), 0.06));
  const back = rgbToHex(hslToRgb(h, Math.min(s, 0.6), 0.02));
  return {
    '--crt-ink': ink,
    '--crt-ink-rgb': hexToRgb(ink).join(', '),
    '--crt-dim': dim,
    '--crt-bg': bg,
    '--crt-back': back,
    ...crtPaperVars(h, s),
  };
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function relLum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// Lightness is stepped away from the page until the accent reaches 4.6:1 on it,
// so accent text and fills read on the paper whatever the user picks.
function accentOnPage(h: number, s: number, l0: number, page: string, towardDark: boolean): string {
  const pl = relLum(hexToRgb(page));
  let l = l0;
  for (let i = 0; i < 60; i++) {
    const c = hslToRgb(h, s, l);
    const cl = relLum(c);
    const ratio = (Math.max(cl, pl) + 0.05) / (Math.min(cl, pl) + 0.05);
    if (ratio >= 4.6) break;
    l += towardDark ? -0.01 : 0.01;
    if (l < 0 || l > 1) break;
  }
  return rgbToHex(hslToRgb(h, s, Math.min(Math.max(l, 0), 1)));
}

// E-ink: body ink stays black or paper white; the accent is the colour of the
// highlights only (fills, sparkline, headings, active state), one value per
// page colour.
export function einkVars(accent: string): Record<string, string> {
  const [h, s0, l0] = rgbToHsl(hexToRgb(accent));
  const s = Math.min(Math.max(s0, 0.45), 0.85);
  const light = accentOnPage(h, s, Math.min(l0, 0.5), '#efede4', true);
  const dark = accentOnPage(h, s, Math.max(l0, 0.6), '#121212', false);
  return {
    '--skin-hi-light': light,
    '--skin-hi-light-rgb': hexToRgb(light).join(', '),
    '--skin-hi-dark': dark,
    '--skin-hi-dark-rgb': hexToRgb(dark).join(', '),
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
  // Near-black ink: the hue survives only as a faint tint, so contrast on the pale cell never depends on the accent.
  const deep = hex(Math.min(s0, 0.3), 0.06);
  // LCD backlight: the cell itself glows in the accent hue. Lightness rises until the near-black ink reads at 7:1 on it.
  const glowSat = Math.min(Math.max(s0, 0.3), 0.5);
  let glowL = 0.5;
  while (glowL < 0.9 && contrastRatio(hexToRgb(deep), hslToRgb(h, glowSat, glowL)) < 7) glowL += 0.01;
  const glow = hex(glowSat, glowL);
  // Daylight cell: a pale, grey tint of the accent (the default accent gives the pale grey-green cell), light enough for 7:1 ink.
  const pale = hex(Math.min(Math.max(s0, 0.2), 0.4), 0.86);
  return {
    '--skin-lit': lit,
    '--skin-lit-rgb': rgb(lit),
    '--skin-deep': deep,
    '--skin-deep-rgb': rgb(deep),
    '--skin-glow': glow,
    '--skin-pale': pale,
    '--skin-day-back': hex(Math.min(s0, 0.2), 0.15),
    '--skin-night': hex(Math.min(s0, 0.7), 0.08),
    '--skin-night-back': hex(Math.min(s0, 0.6), 0.025),
    ...vfdDayVars(h, s0),
  };
}

// VFD in light mode: pale smoked-grey glass with the segments drawn as dark glyphs in the accent hue.
function vfdDayVars(h: number, s0: number): Record<string, string> {
  const bg = '#d3d7da';
  const back = '#b9bec3';
  const surfaces = [hexToRgb(bg), hexToRgb(back)];
  const ink = dimInk(h, Math.max(s0, 0.6), 0.34, true, surfaces, 7);
  const dim = dimInk(h, Math.max(s0, 0.5), 0.38, true, surfaces, 5);
  return {
    '--skin-vfd-day-bg': bg,
    '--skin-vfd-day-back': back,
    '--skin-vfd-day-ink': ink,
    '--skin-vfd-day-ink-rgb': hexToRgb(ink).join(', '),
    '--skin-vfd-day-dim': dim,
  };
}
