// HYTE NP50 device-specific endpoints. The hub exposes two persisted
// surfaces beyond its live cooling-mode + AmpScale warnings: a default
// fan-control mode (what runs when nexus isn't streaming) and a
// firmware-side LED animation (what the strips show without our
// lighting engine). Both are EEPROM-backed; the service does
// read-before-write to avoid burning write cycles.

import { fetchService, putService } from './service';

// ── Default cooling mode (opcode #6 / #7) ──
//
// Wire-byte values for the EEPROM-persisted default mode. Distinct from
// the live cooling-mode bytes (NP50_LIVE_MODE_*) - "Software" isn't a
// meaningful default because by definition nexus isn't running then.
export const NP50_DEFAULT_MODE_STATIC = 0;
export const NP50_DEFAULT_MODE_MOTHERBOARD = 1;

export type Np50DefaultMode =
  | typeof NP50_DEFAULT_MODE_STATIC
  | typeof NP50_DEFAULT_MODE_MOTHERBOARD;

export interface Np50FirmwareDefaults {
  defaultMode: Np50DefaultMode;
  staticFanPercent: number; // 0..100, only meaningful when defaultMode is STATIC
  isStartAnimationOff: boolean;
  isFirmwareLightingOff: boolean;
}

// ── Firmware animation (opcode #13 / #14) ──

export const NP50_FW_ANIMATION_COLOR = 1;
export const NP50_FW_ANIMATION_RAINBOW = 2;
export const NP50_FW_ANIMATION_BREATHE = 3;
export const NP50_FW_ANIMATION_RAINBOW_GRADIENT = 4;

export type Np50FwAnimationKind =
  | typeof NP50_FW_ANIMATION_COLOR
  | typeof NP50_FW_ANIMATION_RAINBOW
  | typeof NP50_FW_ANIMATION_BREATHE
  | typeof NP50_FW_ANIMATION_RAINBOW_GRADIENT;

export interface Np50FirmwareAnimation {
  animation: Np50FwAnimationKind;
  r: number;
  g: number;
  b: number;
  brightness: number; // 0..100
}

// ── Live cooling mode (opcode #3) - used by the cooling page dropdown ──
//
// Static here is the firmware-fallback setpoint (the same speed the hub
// keeps when PC is off). Surfaced to the user as "Firmware Control".
export const NP50_LIVE_MODE_SOFTWARE = 1;
export const NP50_LIVE_MODE_MOTHERBOARD = 2;
export const NP50_LIVE_MODE_STATIC = 3;

export type Np50LiveMode =
  | typeof NP50_LIVE_MODE_SOFTWARE
  | typeof NP50_LIVE_MODE_MOTHERBOARD
  | typeof NP50_LIVE_MODE_STATIC;

// ── Fetches / writes ──

export function getNp50FirmwareDefaults(): Promise<Np50FirmwareDefaults | null> {
  return fetchService<Np50FirmwareDefaults>('/devices/np50/firmware-defaults');
}

export function setNp50FirmwareDefaults(
  defaultMode: Np50DefaultMode,
  staticFanPercent: number,
): Promise<unknown | null> {
  return putService('/devices/np50/firmware-defaults', { defaultMode, staticFanPercent });
}

export function getNp50FirmwareAnimation(): Promise<Np50FirmwareAnimation | null> {
  return fetchService<Np50FirmwareAnimation>('/devices/np50/firmware-animation');
}

export function setNp50FirmwareAnimation(body: Np50FirmwareAnimation): Promise<unknown | null> {
  return putService('/devices/np50/firmware-animation', body);
}

export function setNp50LiveCoolingMode(mode: Np50LiveMode): Promise<unknown | null> {
  return putService('/devices/np50/cooling-mode', { mode });
}

// "FW Control": hand the fans to the firmware's standalone behaviour
// configured on the device page (Static @ stored % or Motherboard PWM). The
// service reads the EEPROM defaults and picks the matching live mode, so the
// cooling page doesn't need to know the setpoint. This is the NP50's off /
// hand-back setting - it has no motherboard "BIOS" hand-off of its own.
export function setNp50FirmwareControl(): Promise<unknown | null> {
  return putService('/devices/np50/firmware-control', {});
}

// Slim view of /devices/np50 - only the bits the cooling-page mode dropdown
// needs. The hub state carries much more (per-port fan list, RPM, AmpScale
// warnings), but the dropdown only cares about whether the device is online
// and what cooling mode it currently reports.
export interface Np50ConnectionState {
  connected: boolean;
  deviceId: string;
  // Service returns this as the parsed string. "Unknown" appears when the
  // firmware reports a mode byte we don't recognise yet.
  coolingMode: 'Software' | 'Motherboard' | 'Static' | 'Unknown';
}

interface Np50StateResponseShape {
  connected?: boolean;
  deviceId?: string;
  state?: {
    hubInfo?: {
      coolingMode?: string;
    };
  };
}

export async function getNp50ConnectionState(): Promise<Np50ConnectionState | null> {
  const raw = await fetchService<Np50StateResponseShape>('/devices/np50');
  if (!raw) return null;
  const mode = (raw.state?.hubInfo?.coolingMode ?? 'Unknown') as Np50ConnectionState['coolingMode'];
  return {
    connected: !!raw.connected,
    deviceId: raw.deviceId ?? '',
    coolingMode: mode,
  };
}

export function np50LiveModeFromName(name: Np50ConnectionState['coolingMode']): Np50LiveMode | null {
  switch (name) {
    case 'Software':    return NP50_LIVE_MODE_SOFTWARE;
    case 'Motherboard': return NP50_LIVE_MODE_MOTHERBOARD;
    case 'Static':      return NP50_LIVE_MODE_STATIC;
    default:            return null;
  }
}

// ── Hub-mode kind used by the cooling page to drive per-fan dropdown display.
// The NP50 has no motherboard "BIOS" hand-off of its own, so FanCard surfaces
// both hub takeovers ('motherboard' and 'firmware') as 'fw' (FW Control) - the
// device page decides whether firmware runs Static or Motherboard underneath.
// 'software' falls through to the per-fan softwareControl + curve binding.
export type Np50HubModeKind = 'software' | 'motherboard' | 'firmware';

export function np50HubModeFromName(name: Np50ConnectionState['coolingMode']): Np50HubModeKind | null {
  switch (name) {
    case 'Software':    return 'software';
    case 'Motherboard': return 'motherboard';
    case 'Static':      return 'firmware';
    default:            return null;
  }
}

// ── Helpers ──

export function np50RgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function np50HexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
