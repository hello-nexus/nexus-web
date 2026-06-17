// HYTE SmartHub device-specific endpoints. The hub persists one combined
// standalone setting in flash: the fan duty its watchdog re-applies to all
// four PWM ports 5 s after the last host fan write (PC off / asleep) plus
// the onboard LED animation it runs without our lighting engine. Read and
// written as a single object via /devices/smarthub/fw-setting.

import { fetchService, putService } from './service';

// ── Firmware animation kinds ──

export const SMARTHUB_FW_ANIMATION_COLOR = 1;
export const SMARTHUB_FW_ANIMATION_RAINBOW = 2;
export const SMARTHUB_FW_ANIMATION_BREATHE = 3;
export const SMARTHUB_FW_ANIMATION_RAINBOW_GRADIENT = 4;

export type SmartHubFwAnimationKind =
  | typeof SMARTHUB_FW_ANIMATION_COLOR
  | typeof SMARTHUB_FW_ANIMATION_RAINBOW
  | typeof SMARTHUB_FW_ANIMATION_BREATHE
  | typeof SMARTHUB_FW_ANIMATION_RAINBOW_GRADIENT;

// Single flash-persisted setting. Color applies to Solid color and
// Breathing only; fanPercent is the watchdog fallback duty.
export interface SmartHubFwSetting {
  animation: SmartHubFwAnimationKind;
  r: number;
  g: number;
  b: number;
  brightness: number; // 0..100
  fanPercent: number; // 0..100
}

// ── Connection state ──
//
// 'unknown' = service unreachable (keep prior UI state; the parent
// ServiceRequired guard handles the no-service case).
export type SmartHubConnectionState = 'connected' | 'disconnected' | 'unknown';

interface SmartHubStateResponseShape {
  connected?: boolean;
  firmwareControl?: boolean;
}

export async function getSmartHubConnectionState(): Promise<SmartHubConnectionState> {
  const raw = await fetchService<SmartHubStateResponseShape>('/devices/smarthub');
  if (!raw) return 'unknown';
  return raw.connected ? 'connected' : 'disconnected';
}

export async function getSmartHubFirmwareControl(): Promise<boolean | null> {
  const raw = await fetchService<SmartHubStateResponseShape>('/devices/smarthub');
  if (!raw) return null;
  return raw.firmwareControl ?? false;
}

export function setSmartHubFirmwareControl(enabled: boolean): Promise<unknown | null> {
  return putService('/devices/smarthub/firmware-control', { enabled });
}

// ── Fetches / writes ──

export function getSmartHubFwSetting(): Promise<SmartHubFwSetting | null> {
  return fetchService<SmartHubFwSetting>('/devices/smarthub/fw-setting');
}

export function setSmartHubFwSetting(body: SmartHubFwSetting): Promise<unknown | null> {
  return putService('/devices/smarthub/fw-setting', body);
}

// ── Helpers ──

export {
  np50RgbToHex as smartHubRgbToHex,
  np50HexToRgb as smartHubHexToRgb,
} from './np50';
