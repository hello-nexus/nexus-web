import { setLightingDeviceColor } from '../../../api/lighting';
import { hsvToHex } from '../../../lib/settings';
import { paletteKey, type PaletteColor } from '../../../types/lightingPalette';
import type { EffectState } from '../../../types/lighting';

/**
 * One device's Static assignment: an effect plus the preset slot it was picked
 * from. Presets are shared definitions and devices hold references, so the slot
 * is stored here, never resolved from the effect's own selected pointer.
 */
export interface DevicePick {
  key: string;
  slot: number;
  hex: string;
}

/** Every surface's record of what each device wears, keyed by device id. */
export type DevicePicks = Record<string, DevicePick>;

/** The localStorage key both the lighting page and the immersive editor read. */
export const DEVICE_PICKS_STORAGE_KEY = 'nexus.lighting.devicePicks';

/**
 * The selection both surfaces share, so a pick made on one targets the other's.
 * Browser-local: the service owns the assignment but exposes no per-device look,
 * so two profiles (or two machines) keep separate selections and pick records.
 */
export const SELECTED_DEVICES_STORAGE_KEY = 'nexus.lighting.selectedDevices';

/** The selection's anchor device, read by the page's scoped editor. */
export const PRIMARY_DEVICE_STORAGE_KEY = 'nexus.lighting.primaryDevice';

function withPick(prev: DevicePicks, ids: string[], pick: DevicePick): DevicePicks {
  const next = { ...prev };
  for (const id of ids) next[id] = pick;
  return next;
}

/**
 * A look chosen from the effect grid, applied to `ids`. The whole look travels,
 * so the service renders THIS effect for the device rather than approximating
 * it with the swatch colour. `push` false records the pick without touching the
 * hardware, for a preview that has not been committed yet.
 */
export function pickLookForDevices(
  prev: DevicePicks,
  key: string,
  slot: number,
  state: EffectState,
  ids: string[],
  push: boolean,
): DevicePicks {
  const hue = Math.min(1, Math.max(0, state.hue));
  const sat = Math.min(1, Math.max(0, state.saturation));
  const next = withPick(prev, ids, { key, slot, hex: hsvToHex(hue * 360, sat * 100, 100) });
  if (!push) return next;
  const look = {
    effect: key,
    intensity: state.intensity,
    colorize: state.colorize,
    contrast: state.contrast,
    params: state.params,
  };
  for (const id of ids) {
    setLightingDeviceColor(id, hue, sat, look).catch(() => { /* best-effort */ });
  }
  return next;
}

/**
 * A palette pick is a colour and nothing else, so it travels as one and the
 * service paints it with no shader, no preset and no params.
 */
export function pickPaletteForDevices(
  prev: DevicePicks,
  color: PaletteColor,
  ids: string[],
): DevicePicks {
  const next = withPick(prev, ids, { key: paletteKey(color.id), slot: 0, hex: color.hex });
  for (const id of ids) {
    setLightingDeviceColor(id, color.h, color.s, {
      effect: 'flat', color: color.hex, intensity: 1, colorize: 0, contrast: 1, params: {},
    }).catch(() => { /* best-effort */ });
  }
  return next;
}
