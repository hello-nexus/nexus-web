import { setLightingDeviceColor, type StaticDeviceLookDto } from '../../../api/lighting';
import { hexToHsv, hsvToHex } from '../../../lib/settings';
import { nearestPaletteId, paletteKey, type PaletteColor } from '../../../types/lightingPalette';
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
 * The lighting page's selection. Browser-local: the service owns the assignment
 * but exposes no per-device look, so two profiles (or two machines) keep
 * separate selections and pick records. The immersive editor does not read it -
 * it starts from every device instead (see LightingTouch).
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
    slot,
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
  pushPalettePick(color, ids);
  return next;
}

/** The service-side half of {@link pickPaletteForDevices}, exposed so a caller
 *  that must run after the writes land can await them. */
export function pushPalettePick(color: PaletteColor, ids: string[]): Promise<unknown> {
  return Promise.all(ids.map(id => setLightingDeviceColor(id, color.h, color.s, {
    effect: 'flat', color: color.hex, intensity: 1, colorize: 0, contrast: 1, params: {},
  }).catch(() => { /* best-effort */ })));
}

/**
 * A colour picked from the palette's custom slot. Same wire shape as a palette
 * pick - the service paints a flat colour either way - but the key carries the
 * nearest palette id only so existing key handling keeps working; the hex is
 * what actually travels, and it is what marks the pick as off-palette on
 * read-back.
 */
export function pickCustomForDevices(
  prev: DevicePicks,
  hex: string,
  ids: string[],
  push = true,
): DevicePicks {
  const next = withPick(prev, ids, { key: paletteKey(nearestPaletteId(hex)), slot: 0, hex });
  if (push) pushCustomPick(hex, ids);
  return next;
}

/** The service-side half of {@link pickCustomForDevices}. */
export function pushCustomPick(hex: string, ids: string[]): Promise<unknown> {
  const { h, s } = hexToHsv(hex);
  return Promise.all(ids.map(id => setLightingDeviceColor(id, h / 360, s / 100, {
    effect: 'flat', color: hex, intensity: 1, colorize: 0, contrast: 1, params: {},
  }).catch(() => { /* best-effort */ })));
}

/**
 * Rebuild every device's pick from what the service has stored. The service is
 * the owner - a preset activate, a profile switch or a fresh browser all leave
 * the local record stale, and only this reconciles them.
 */
export function devicePicksFromLooks(looks: Record<string, StaticDeviceLookDto>): DevicePicks {
  const out: DevicePicks = {};
  for (const [id, look] of Object.entries(looks)) {
    if (!look?.effect) continue;
    out[id] = look.effect === 'flat' && look.color
      // A palette pick stores only its hex, so the id resolves back from that.
      ? { key: paletteKey(nearestPaletteId(look.color)), slot: 0, hex: look.color }
      : { key: look.effect, slot: look.slot, hex: hsvToHex(look.hue * 360, look.saturation * 100, 100) };
  }
  return out;
}
