import { hsvToHex } from '../lib/settings';

/**
 * The Static-mode colour palette.
 *
 * A per-device Static pick is a colour, so it is stored as one: a palette id
 * and its hex, with no effect, no preset slot and no tint controls. Patterns
 * still go through the effect catalogue; this covers everything that is just
 * "make it this colour".
 */

export const PALETTE_FAMILIES = [
  'white', 'red', 'orange', 'yellow', 'lime', 'green', 'teal',
  'cyan', 'azure', 'blue', 'indigo', 'violet', 'magenta', 'pink',
] as const;

export type PaletteFamily = typeof PALETTE_FAMILIES[number];

export interface PaletteColor {
  /** Stable storage id, `<family>-<shade>`. */
  id: string;
  family: PaletteFamily;
  /** 1-based position within the family, and the number shown in the name. */
  shade: number;
  hex: string;
  /** The same colour as HSV, 0..1 each, for the device's hue/saturation prefs. */
  h: number;
  s: number;
  v: number;
}

/** Hue per chromatic family, 0..1. */
const FAMILY_HUE: Record<Exclude<PaletteFamily, 'white'>, number> = {
  red: 0.000, orange: 0.060, yellow: 0.140, lime: 0.220, green: 1 / 3,
  teal: 0.450, cyan: 0.500, azure: 0.570, blue: 2 / 3, indigo: 0.730,
  violet: 0.790, magenta: 0.860, pink: 0.930,
};

/**
 * Saturation / value per shade, pale to dark. LEDs are emissive, so the darkest
 * step stops well short of black - below roughly a third value a strip reads as
 * off rather than as a dark colour.
 */
const SHADES: { s: number; v: number }[] = [
  { s: 0.35, v: 1.00 },
  { s: 0.60, v: 1.00 },
  { s: 1.00, v: 1.00 },
  { s: 1.00, v: 0.70 },
  { s: 1.00, v: 0.45 },
];

/**
 * Neutral white, dimmed down its column the way every hue darkens down its own.
 * Tinted whites are the pale end of the hue columns - yellow 1 is a warm white,
 * azure 1 a cool one - so this stays a straight value ramp.
 */
const WHITES: { h: number; s: number; v: number }[] = [
  { h: 0, s: 0, v: 1.00 },
  { h: 0, s: 0, v: 0.78 },
  { h: 0, s: 0, v: 0.58 },
  { h: 0, s: 0, v: 0.42 },
  { h: 0, s: 0, v: 0.30 },
];

function build(): PaletteColor[] {
  const out: PaletteColor[] = [];
  for (const family of PALETTE_FAMILIES) {
    if (family === 'white') {
      WHITES.forEach((c, i) => out.push({
        id: `white-${i + 1}`, family, shade: i + 1,
        hex: hsvToHex(c.h * 360, c.s * 100, c.v * 100),
        h: c.h, s: c.s, v: c.v,
      }));
      continue;
    }
    const hue = FAMILY_HUE[family];
    SHADES.forEach((c, i) => out.push({
      id: `${family}-${i + 1}`, family, shade: i + 1,
      hex: hsvToHex(hue * 360, c.s * 100, c.v * 100),
      h: hue, s: c.s, v: c.v,
    }));
  }
  return out;
}

export const PALETTE: readonly PaletteColor[] = build();

export const PALETTE_SHADE_COUNT = SHADES.length;

/**
 * Shade-major: one entry per step, each listing every family's colour at that
 * step. Drawn as the swatch grid's rows, so hues line up across and a family's
 * light-to-dark run reads down a column.
 */
export const PALETTE_SHADE_ROWS: readonly (readonly PaletteColor[])[] =
  Array.from({ length: PALETTE_SHADE_COUNT }, (_, i) =>
    PALETTE_FAMILIES.map(family => PALETTE.find(c => c.family === family && c.shade === i + 1)!));

const BY_ID = new Map(PALETTE.map(c => [c.id, c]));

export function paletteColor(id: string): PaletteColor | undefined {
  return BY_ID.get(id);
}

/** i18n key for a family's display name; the shade number is appended. */
export function paletteFamilyKey(family: PaletteFamily): string {
  return `lighting.palette.${family}`;
}

/**
 * Palette picks share the device-pick shape with effect picks, so their key is
 * namespaced: `flat:red-3` can never collide with an effect key.
 */
const KEY_PREFIX = 'flat:';

export function paletteKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function isPaletteKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX);
}

export function paletteIdFromKey(key: string): string | null {
  return isPaletteKey(key) ? key.slice(KEY_PREFIX.length) : null;
}

/** The palette colour a device-pick key refers to, if it is a palette pick. */
export function paletteColorForKey(key: string): PaletteColor | undefined {
  const id = paletteIdFromKey(key);
  return id ? paletteColor(id) : undefined;
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Closest palette entry to an arbitrary colour. Migration reads the hex a
 * legacy flat pick already stored, so a hue-shifted red lands on the palette
 * red nearest what the device was actually wearing.
 */
export function nearestPaletteId(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return PALETTE[0].id;
  const [r, g, b] = rgb(hex);
  let best = PALETTE[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of PALETTE) {
    const [cr, cg, cb] = rgb(c.hex);
    const d = ((r - cr) ** 2) + ((g - cg) ** 2) + ((b - cb) ** 2);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.id;
}
