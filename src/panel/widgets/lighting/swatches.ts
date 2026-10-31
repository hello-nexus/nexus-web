import { ANIMATE_EFFECTS } from '../../../types/lighting';
import { customEffectId, isCustomEffectKey } from '../../../api/customEffects';
import { canonicalSimpleKey } from './simpleAnimations';
import { PALETTE, paletteColor } from '../../../types/lightingPalette';
import { TEMPLATE_COUNT } from '../../../types/lighting';
import { parseAnimationRecent } from './recents';
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
  'white-1', 'red-3', 'blue-3', 'green-3', 'yellow-3', 'violet-3',
  'orange-3', 'cyan-3', 'magenta-3', 'pink-3', 'lime-3', 'teal-3',
  'azure-3', 'indigo-3', 'red-4', 'orange-2', 'yellow-2', 'green-2',
  'cyan-2', 'blue-2', 'violet-2', 'pink-2', 'white-3', 'green-4',
];

export const STATIC_SWATCHES = STATIC_SWATCH_IDS
  .map(paletteColor)
  .filter((c): c is NonNullable<ReturnType<typeof paletteColor>> => !!c);

export interface SwatchEffect { key: string; labelKey: string }

/** One animation tile: an effect at the preset slot it shows and applies. `label` is a custom effect's own name. */
export interface AnimationTile extends SwatchEffect { slot: number; tileKey: string; label?: string }

export interface AnimationTileContext {
  /** Saved Studio effects by id, to their names. A custom recent whose id is absent is dropped. */
  customs?: ReadonlyMap<string, string>;
  /** The effect's currently selected preset, for bare keys and the default tiles. */
  selectedSlot?: (effect: string) => number;
}

const clampSlot = (n: number) => Math.min(Math.max(Math.trunc(n), 0), TEMPLATE_COUNT - 1);

/** Animation swatch order; the rest of ANIMATE_EFFECTS follows in its own order. */
export const DEFAULT_ANIMATION_KEYS = [
  'rainbow', 'plasma', 'fire', 'sweepliquid', 'sweepcomet',
  'breathing', 'watercolor', 'sweepcycle', 'contourbands', 'oilslick',
  'matrix', 'jellyfish', 'aurora', 'sharplines', 'spiral',
  'cybertunnel', 'crystaltunnel',
];

const MAX_SWATCHES = 32;

const EFFECT_BY_KEY = new Map<string, SwatchEffect>(ANIMATE_EFFECTS.map(e => [e.key, e]));

function effectFor(key: string): SwatchEffect | null {
  return EFFECT_BY_KEY.get(canonicalSimpleKey(key)) ?? null;
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

/**
 * Recent animations first (when on), then the fixed order. A recent keeps the preset it was picked at;
 * a bare older key falls back to the effect's current preset. One tile per (effect, preset), and the
 * fixed order skips effects a recent already shows. Keys that resolve to no effect are dropped.
 */
export function pickAnimationTiles(recents: readonly string[], useRecents: boolean, slots: number, ctx: AnimationTileContext = {}): AnimationTile[] {
  const out: AnimationTile[] = [];
  const selected = (key: string) => clampSlot(ctx.selectedSlot?.(key) ?? 0);
  const add = (fx: (SwatchEffect & { label?: string }) | null, slot: number | null, force: boolean) => {
    if (!fx) return;
    const s = slot ?? selected(fx.key);
    if (out.some(o => o.key === fx.key && (force ? o.slot === s : true))) return;
    out.push({ ...fx, slot: s, tileKey: `${fx.key}@${s}` });
  };
  if (useRecents) {
    for (const raw of recents) {
      const { effect, slot } = parseAnimationRecent(raw);
      const s = slot === null ? null : clampSlot(slot);
      if (isCustomEffectKey(effect)) {
        const name = ctx.customs?.get(customEffectId(effect));
        if (name !== undefined) add({ key: effect, labelKey: '', label: name }, s, true);
      } else {
        add(effectFor(effect), s, true);
      }
    }
  }
  for (const fx of ANIMATE_SWATCHES) add(fx, null, false);
  return out.slice(0, slots);
}
