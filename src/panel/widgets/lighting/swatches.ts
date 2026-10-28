import { ANIMATE_EFFECTS } from '../../../types/lighting';
import { simpleAnimationLabelKey } from './simpleAnimations';
import { paletteColor, type PaletteColor } from '../../../types/lightingPalette';
import type { PanelWidget } from '../../types';

const STATIC_SWATCH_IDS = [
  'white-1', 'red-3', 'orange-3', 'yellow-3', 'green-3', 'cyan-3',
  'blue-3', 'violet-3', 'magenta-3', 'pink-3', 'lime-3', 'teal-3',
  'azure-3', 'indigo-3', 'white-3', 'red-4',
];

export const STATIC_SWATCHES: readonly PaletteColor[] = STATIC_SWATCH_IDS
  .map(paletteColor)
  .filter((c): c is PaletteColor => !!c);

export interface SwatchEffect { key: string; labelKey: string }

/** Animation swatch order; the rest of ANIMATE_EFFECTS follows in catalog order. */
export const DEFAULT_ANIMATION_KEYS = [
  'sweeprainbow', 'sharplines', 'breathing', 'plasma', 'fire',
  'aurora', 'spiral', 'crystaltunnel', 'cybertunnel',
];

const MAX_SWATCHES = 16;

function swatchEffects(): SwatchEffect[] {
  const byKey = new Map<string, SwatchEffect>(ANIMATE_EFFECTS.map(e => [e.key, e]));
  const out: SwatchEffect[] = [];
  for (const key of DEFAULT_ANIMATION_KEYS) {
    const fx = byKey.get(key);
    if (fx) out.push(fx);
    else if (key.startsWith('sweep')) out.push({ key, labelKey: simpleAnimationLabelKey(key) });
  }
  for (const e of ANIMATE_EFFECTS) if (!out.some(o => o.key === e.key)) out.push(e);
  return out.slice(0, MAX_SWATCHES);
}

export const ANIMATE_SWATCHES: readonly SwatchEffect[] = swatchEffects();

const MIN_CELL_W = 52;
const GAP = 8;

/** Count shown before the widget is measured, and wherever layout is unavailable. */
export function defaultSwatchCount(size: PanelWidget['size']): number {
  if (size === '2x2') return 4;
  if (size === '4x2') return 6;
  return 12;
}

export interface SwatchGrid { cols: number; rows: number; count: number }

/** Largest whole-cell grid of at-least-minimum cells that fits the box, capped at `max`. */
export function fitSwatchGrid(width: number, height: number, cellAspect: number, max: number): SwatchGrid {
  if (width <= 0 || height <= 0) return { cols: 1, rows: 1, count: 1 };
  const cols = Math.max(1, Math.floor((width + GAP) / (MIN_CELL_W + GAP)));
  const cellW = (width - GAP * (cols - 1)) / cols;
  const rows = Math.max(1, Math.floor((height + GAP) / (cellW / cellAspect + GAP)));
  return { cols, rows, count: Math.min(max, cols * rows) };
}
