import { ANIMATE_EFFECTS } from '../../../types/lighting';
import { simpleAnimationLabelKey } from './simpleAnimations';
import { PALETTE, paletteColor } from '../../../types/lightingPalette';
import type { PanelWidget } from '../../types';

/** Columns and rows per widget size, open tile included; identical with and without mode buttons. */
const GRIDS: Partial<Record<PanelWidget['size'], { cols: number; rows: number }>> = {
  '2x2': { cols: 2, rows: 2 },
  '4x2': { cols: 3, rows: 2 },
  '4x4': { cols: 3, rows: 5 },
};

export function swatchGrid(size: PanelWidget['size'], withOpenTile = true): { cols: number; rows: number; slots: number } {
  const g = GRIDS[size] ?? { cols: 3, rows: 5 };
  return { ...g, slots: g.cols * g.rows - (withOpenTile ? 1 : 0) };
}

export interface StaticTile { hex: string; name: string | null; nameKey: string | null; shade: number }

const STATIC_SWATCH_IDS = [
  'white-1', 'red-3', 'orange-3', 'yellow-3', 'green-3', 'cyan-3',
  'blue-3', 'violet-3', 'magenta-3', 'pink-3', 'lime-3', 'teal-3',
  'azure-3', 'indigo-3', 'red-4', 'orange-2', 'yellow-2', 'green-2',
  'cyan-2', 'blue-2', 'violet-2', 'pink-2', 'white-3', 'green-4',
];

export const STATIC_SWATCHES = STATIC_SWATCH_IDS
  .map(paletteColor)
  .filter((c): c is NonNullable<ReturnType<typeof paletteColor>> => !!c);

export interface SwatchEffect { key: string; labelKey: string }

/** Animation swatch order; the rest of ANIMATE_EFFECTS follows in catalog order. */
export const DEFAULT_ANIMATION_KEYS = [
  'sweeprainbow', 'plasma', 'fire', 'sweepliquid', 'sweepcomet',
  'sweepbreathing', 'watercolor', 'sweepcycle', 'contourbands', 'oilslick',
  'matrix', 'jellyfish', 'aurora', 'sharplines', 'spiral',
  'cybertunnel', 'crystaltunnel',
];

const MAX_SWATCHES = 32;

const EFFECT_BY_KEY = new Map<string, SwatchEffect>(ANIMATE_EFFECTS.map(e => [e.key, e]));

function effectFor(key: string): SwatchEffect | null {
  const fx = EFFECT_BY_KEY.get(key);
  if (fx) return fx;
  const labelKey = key.startsWith('sweep') ? simpleAnimationLabelKey(key) : undefined;
  return labelKey ? { key, labelKey } : null;
}

function defaultEffects(): SwatchEffect[] {
  const out: SwatchEffect[] = [];
  for (const key of DEFAULT_ANIMATION_KEYS) {
    const fx = effectFor(key);
    if (fx) out.push(fx);
  }
  for (const e of ANIMATE_EFFECTS) if (!out.some(o => o.key === e.key)) out.push(e);
  return out.slice(0, MAX_SWATCHES);
}

export const ANIMATE_SWATCHES: readonly SwatchEffect[] = defaultEffects();

const HEX = /^#[0-9a-f]{6}$/i;

/** Recent colors first (when on), then the fixed palette, one tile per distinct color. */
export function pickStaticTiles(recents: readonly string[], useRecents: boolean, slots: number): StaticTile[] {
  const out: StaticTile[] = [];
  const seen = new Set<string>();
  const add = (t: StaticTile) => {
    const k = t.hex.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  };
  if (useRecents) {
    for (const hex of recents) {
      if (!HEX.test(hex)) continue;
      const known = PALETTE.find(c => c.hex.toLowerCase() === hex.toLowerCase());
      add({ hex, name: known ? null : hex, nameKey: known ? `lighting.palette.${known.family}` : null, shade: known?.shade ?? 0 });
    }
  }
  for (const c of STATIC_SWATCHES) add({ hex: c.hex, name: null, nameKey: `lighting.palette.${c.family}`, shade: c.shade });
  return out.slice(0, slots);
}

/** Recent animations first (when on), then the fixed order, deduped. */
export function pickAnimationTiles(recents: readonly string[], useRecents: boolean, slots: number): SwatchEffect[] {
  const out: SwatchEffect[] = [];
  const add = (fx: SwatchEffect | null) => { if (fx && !out.some(o => o.key === fx.key)) out.push(fx); };
  if (useRecents) for (const key of recents) add(effectFor(key));
  for (const fx of ANIMATE_SWATCHES) add(fx);
  return out.slice(0, slots);
}
