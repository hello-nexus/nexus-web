import type { Pin, PinKind } from '../../../api/lighting';
import { hexToHsv, hsvToHex } from '../../../lib/settings';
import { nearestPaletteId, paletteColorForKey, paletteFamilyKey, paletteKey, type PaletteColor } from '../../../types/lightingPalette';
import { EFFECTS, type EffectState, type LightingMode } from '../../../types/lighting';
import { isSimpleAnimation, simpleAnimationLabelKey } from './simpleAnimations';
import { canvasLabelName } from '../../../lib/canvasLabelName';

/** Device id to the pin it wears. Absent means following the global mode. */
export type Pins = Readonly<Record<string, Pin>>;

/**
 * The selection the lighting page keeps across navigation. An empty selection
 * means "all devices": a pick then applies globally and pins nothing.
 */
export const SELECTED_DEVICES_STORAGE_KEY = 'nexus.lighting.pinSelection';

/** The selection's anchor device, highlighted on the canvas and 3D scene. */
export const PRIMARY_DEVICE_STORAGE_KEY = 'nexus.lighting.primaryDevice';

/** Keys of the per-device-pick era. */
const LEGACY_LIGHTING_KEYS = [
  'nexus.lighting.selectedDevices',
  'nexus.lighting.devicePicks',
  'nexus.lighting.selectionSeeded',
];

export function clearLegacyLightingKeys(): void {
  try {
    for (const key of LEGACY_LIGHTING_KEYS) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing was kept there */ }
}

/** `pins` with every id set to `pin`, or removed for a null pin. */
export function withPins(prev: Pins, ids: readonly string[], pin: Pin | null): Pins {
  let next: Record<string, Pin> | null = null;
  for (const id of ids) {
    if (pin === null) {
      if (!(id in prev)) continue;
      next ??= { ...prev };
      delete next[id];
    } else if (prev[id] !== pin) {
      next ??= { ...prev };
      next[id] = pin;
    }
  }
  return next ?? prev;
}

/** The static pin for a pattern picked from the grid. The whole look travels, so
 *  the service renders THIS effect for the device, not the swatch color. */
export function staticLookPin(key: string, slot: number, state: EffectState): Pin {
  return {
    kind: 'static',
    effect: key,
    intensity: state.intensity,
    hue: Math.min(1, Math.max(0, state.hue)),
    colorize: state.colorize,
    saturation: Math.min(1, Math.max(0, state.saturation)),
    contrast: state.contrast,
    params: state.params,
    slot,
  };
}

/** The static pin for a plain color (palette swatch or picker): a flat fill. */
export function colorPin(hex: string): Pin {
  const { h, s } = hexToHsv(hex);
  return {
    kind: 'static', effect: 'flat', color: hex,
    intensity: 1, hue: h / 360, colorize: 0, saturation: s / 100, contrast: 1, params: {}, slot: 0,
  };
}

/** The static pin for a palette swatch. */
export const paletteColorPin = (color: PaletteColor): Pin => ({
  ...colorPin(color.hex), hue: color.h, saturation: color.s,
});

export const animatePin = (effect: string): Pin => ({ kind: 'animate', effect });

/** The mode tab a pin kind belongs to, whose icon the pinned card wears. */
export const pinMode = (kind: PinKind): LightingMode => kind === 'mirror' ? 'screen' : kind === 'media' ? 'gif' : kind;

export const MIRROR_PIN: Pin = { kind: 'mirror' };
/** The one shared Media source, as Mirror is the one shared capture. */
export const MEDIA_PIN: Pin = { kind: 'media' };

/** Stable identity of a pin's target, for "do these devices share one pin". */
export function pinSignature(pin: Pin): string {
  // A static pin on a template slot is (effect, slot), the identity the drawer
  // edits; a flat color is its color; a shader pin is the shader alone.
  if (pin.kind === 'static') {
    return pin.effect === 'flat' ? JSON.stringify(['static', 'flat', (pin.color ?? '').toLowerCase()])
      : JSON.stringify(['static', pin.effect ?? '', pin.slot ?? 0]);
  }
  return JSON.stringify([pin.kind, pin.effect ?? '']);
}

/**
 * What a selection wears. `none`: nothing selected, or every selected device
 * follows the global mode. `pin`: they all wear one pin. `mixed`: they differ.
 */
export type SelectionPin =
  | { kind: 'none' }
  | { kind: 'pin'; pin: Pin }
  | { kind: 'mixed' };

export function selectionPin(pins: Pins, ids: readonly string[]): SelectionPin {
  if (ids.length === 0) return { kind: 'none' };
  let first: Pin | null | undefined;
  let sig = '';
  for (const id of ids) {
    const pin = pins[id] ?? null;
    const s = pin ? pinSignature(pin) : '';
    if (first === undefined) { first = pin; sig = s; } else if (s !== sig) return { kind: 'mixed' };
  }
  return first ? { kind: 'pin', pin: first } : { kind: 'none' };
}

/** The effect-grid key a static or animate pin lights: a flat color resolves to its palette swatch. */
export function pinGridKey(pin: Pin): string {
  if (pin.kind === 'static' && pin.effect === 'flat' && pin.color) return paletteKey(nearestPaletteId(pin.color));
  return pin.effect ?? '';
}

/** The color a static pin shows on a card strip or marker. */
export function pinHex(pin: Pin): string {
  if (pin.color) return pin.color;
  return hsvToHex((pin.hue ?? 0) * 360, (pin.saturation ?? 1) * 100, 100);
}

/** What a card strip falls back to painting when the frame carries no bytes for a pinned device. */
export function pinStripPick(pin: Pin): { key: string; slot: number; hex: string } | null {
  if (pin.kind === 'mirror' || !pin.effect) return null;
  return { key: pinGridKey(pin), slot: pin.slot ?? 0, hex: pinHex(pin) };
}

/** Ids of `ids` that wear a pin. */
export const pinnedAmong = (pins: Pins, ids: readonly string[]): string[] => ids.filter(id => id in pins);

type Reach = { ledsOn?: boolean; controlled?: boolean; devicePageReason?: string };

/** A card the engine drives: lit, controlled, and not set on its device page (no engine frame). */
export const engineReaches = (d: Reach): boolean => d.ledsOn !== false && d.controlled !== false && d.devicePageReason === undefined;

/** Page Select all skips Nexus Control off cards and cards set on their device page. */
export const selectAllEligible = (d: { controlled?: boolean; devicePageReason?: string }): boolean =>
  d.controlled !== false && d.devicePageReason === undefined;

/** With nothing selected, a pick lands on every unpinned lit and controlled device; a selection marks its own target. */
export const isPickTarget = (d: { id: string } & Reach, pins: Pins, selectedIds: ReadonlySet<string>): boolean =>
  selectedIds.size === 0 && !(d.id in pins) && engineReaches(d);

/**
 * The lit, controlled cards a press or pick changes: the selection, or with none
 * every unpinned one. Off overrides pins, so it reaches them all.
 */
export function pressReach(
  devices: readonly ({ id: string } & Reach)[],
  pins: Pins,
  selectedIds: ReadonlySet<string>,
  overridesPins = false,
): Set<string> {
  const lit = devices.filter(engineReaches);
  if (overridesPins) return new Set(lit.map(d => d.id));
  if (selectedIds.size > 0) return new Set(lit.filter(d => selectedIds.has(d.id)).map(d => d.id));
  return new Set(lit.filter(d => !(d.id in pins)).map(d => d.id));
}

/** A press on the tab already showing changes no card with nothing selected, or when the selection already wears that mode's pin. */
export const tabPressChangesNothing = (key: string, activeKey: string | undefined, selectedCount: number, selectionPinned: boolean): boolean =>
  key === activeKey && (selectedCount === 0 || selectionPinned);

/**
 * The Static picker's marks, on the color each device wears (an unpinned one
 * wears the global color), named as the canvas frames are: the selection, or
 * with none, every lit and controlled device. Pinned ones are flagged.
 */
export function pickerMarks(
  devices: readonly { id: string; name: string; originalName?: string; ledsOn?: boolean; controlled?: boolean; devicePageReason?: string }[],
  pins: Pins,
  selectedIds: ReadonlySet<string>,
  globalColor: string,
): { id: string; name: string; hex: string; pinned: boolean }[] {
  const none = selectedIds.size === 0;
  return devices
    .filter(d => (none ? engineReaches(d) : selectedIds.has(d.id)))
    .map(d => {
      const pin = pins[d.id];
      return { id: d.id, name: canvasLabelName(d), hex: !pin ? globalColor : pin.kind === 'static' ? pinHex(pin) : '', pinned: !!pin };
    });
}

/**
 * Device names per target effect, for the thumbnail badge: animate pins
 * (`kind` 'animate') or static pattern pins (`kind` 'static'). Ids with no
 * known device are left out, and the count follows the names.
 */
export function pinnedNamesByEffect(
  pins: Pins,
  kind: 'animate' | 'static',
  nameOf: (id: string) => string | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, pin] of Object.entries(pins)) {
    if (pin.kind !== kind || !pin.effect || (kind === 'static' && pin.effect === 'flat')) continue;
    const name = nameOf(id);
    if (!name) continue;
    const names = out.get(pin.effect);
    if (names) names.push(name); else out.set(pin.effect, [name]);
  }
  return out;
}

/** A pinned card's tooltip name: "{mode}: {target}" for a static or animate pin, the mode alone for Mirror and Media. */
export function pinModeTargetLabel(pin: Pin, t: (key: string, params?: Record<string, string>) => string): string {
  if (pin.kind === 'mirror' || pin.kind === 'media') return pinTargetLabel(pin, t);
  const mode = t(pin.kind === 'static' ? 'lighting.mode.static' : 'lighting.mode.animate');
  const name = pinTargetLabel(pin, t);
  return name ? t('lighting.pin.modeTarget', { mode, name }) : mode;
}

/** What a pin points at, for tooltips: the shader or simple sweep, the palette swatch or hex, or Mirror. */
export function pinTargetLabel(pin: Pin, t: (key: string) => string): string {
  if (pin.kind === 'mirror') return t('lighting.mode.screen');
  if (pin.kind === 'media') return t('lighting.mode.gif');
  if (pin.kind === 'static' && pin.effect === 'flat') {
    const palette = paletteColorForKey(pinGridKey(pin));
    return palette ? `${t(paletteFamilyKey(palette.family))} ${palette.shade}` : (pin.color ?? '').toUpperCase();
  }
  if (!pin.effect) return '';
  if (isSimpleAnimation(pin.effect)) return t(simpleAnimationLabelKey(pin.effect));
  const def = EFFECTS.find(e => e.key === pin.effect);
  return def ? t(def.labelKey) : pin.effect;
}
