// HYTE Q-series (Q60 / Q80) cooler-controller API - the firmware options on
// the Q60 device page's settings tab. Pump speed itself is driven through the
// cooling fan-channel path; these cover the hub-wide firmware settings.

import { fetchService, postService, putService } from './service';

// Hub control mode (matches QSeriesCoolerProtocol.ControlMode* on the service).
export const QSERIES_MODE_SOFTWARE = 1;
export const QSERIES_MODE_MOTHERBOARD = 2;
export const QSERIES_MODE_FIRMWARE = 3;

export type QSeriesControlMode =
  | typeof QSERIES_MODE_SOFTWARE
  | typeof QSERIES_MODE_MOTHERBOARD
  | typeof QSERIES_MODE_FIRMWARE;

export interface QSeriesCoolerState {
  connected: boolean;
  deviceId: string;
  productName: string;
  variant: string;
  firmwareVersion: string;
  pumpRpm: number;
  pump2Rpm: number;
  hasPump2: boolean;
  controlMode: number;
  turboOn: boolean;
  fwAnimationSupported: boolean;
  fwAnimationBrightnessSupported: boolean;
}

export const getQSeriesState = (): Promise<QSeriesCoolerState | null> =>
  fetchService<QSeriesCoolerState>('/devices/qseries');

export const setQSeriesControlMode = (mode: QSeriesControlMode): Promise<unknown | null> =>
  putService('/devices/qseries/control-mode', { mode });

export const setQSeriesTurbo = (on: boolean): Promise<unknown | null> =>
  putService('/devices/qseries/turbo', { on });

// ── Firmware-mode LED animation (effect + static color + brightness) ──

export const QSERIES_FW_ANIMATION_COLOR = 1;
export const QSERIES_FW_ANIMATION_RAINBOW = 2;
export const QSERIES_FW_ANIMATION_BREATHE = 3;
export const QSERIES_FW_ANIMATION_RAINBOW_GRADIENT = 4;

export type QSeriesFwAnimationKind =
  | typeof QSERIES_FW_ANIMATION_COLOR
  | typeof QSERIES_FW_ANIMATION_RAINBOW
  | typeof QSERIES_FW_ANIMATION_BREATHE
  | typeof QSERIES_FW_ANIMATION_RAINBOW_GRADIENT;

export interface QSeriesFirmwareAnimation {
  animation: QSeriesFwAnimationKind;
  r: number;
  g: number;
  b: number;
  brightness: number; // percent
}

export const getQSeriesFirmwareAnimation = (): Promise<QSeriesFirmwareAnimation | null> =>
  fetchService<QSeriesFirmwareAnimation>('/devices/qseries/firmware-animation');

export const setQSeriesFirmwareAnimation = (body: QSeriesFirmwareAnimation): Promise<unknown | null> =>
  putService('/devices/qseries/firmware-animation', body);

export { np50RgbToHex as qSeriesRgbToHex, np50HexToRgb as qSeriesHexToRgb } from './np50';

// ── Firmware temperature curve (pump + fan) ──

export interface QSeriesCurvePoint {
  tempC: number;
  dutyPercent: number;
}

export interface QSeriesFirmwareCurve {
  connected: boolean;
  /** False on cooler firmware too old for the 5-point curve format. */
  supported: boolean;
  variant: string;
  tempMin: number;
  tempMax: number;
  pump: QSeriesCurvePoint[];
  fan: QSeriesCurvePoint[];
}

export const getQSeriesFirmwareCurve = (): Promise<QSeriesFirmwareCurve | null> =>
  fetchService<QSeriesFirmwareCurve>('/devices/qseries/firmware-curve');

export const setQSeriesFirmwareCurve = (
  pump: QSeriesCurvePoint[],
  fan: QSeriesCurvePoint[],
): Promise<unknown | null> =>
  putService('/devices/qseries/firmware-curve', { pump, fan });

// ── Panel orientation (mirrors /y70/rotation in shape and auth; Q60/Q80
// mount portrait or portrait-flipped only, no landscape) ──

export type QSeriesOrientation = 'Portrait' | 'PortraitFlipped';

export interface QSeriesRotation {
  orientation: QSeriesOrientation;
}

export const getQSeriesRotation = (): Promise<QSeriesRotation | null> =>
  fetchService<QSeriesRotation>('/qseries/rotation');

export const setQSeriesRotation = (orientation: QSeriesOrientation): Promise<{ ok: boolean } | null> =>
  postService('/qseries/rotation', { orientation });

// ── Display (brightness, screen power, sleep-with-host) ──

export interface QSeriesDisplay {
  brightness: number;
  screenOff: boolean;
  sleepWithHost: boolean;
}

export const getQSeriesDisplay = (): Promise<QSeriesDisplay | null> =>
  fetchService<QSeriesDisplay>('/qseries/display');

export const setQSeriesDisplay = (
  patch: Partial<QSeriesDisplay>,
): Promise<unknown | null> =>
  postService('/qseries/display', patch);

// ── Panel lifecycle (NEX-14) ──
//
// A PC shutdown cuts panel power without letting its Android side power-cycle,
// so these give the user a clean reboot and a way back from a corrupted panel.
// Both return once the work is QUEUED, not once it is finished: null means the
// request was rejected (no panel, or an install already holds the transport).

/** Reboots the panel's Android side; a cold qshell bootstrap follows, ~2 min over USB-FFS. */
export const rebootQSeriesPanel = (): Promise<unknown | null> =>
  postService('/devices/qseries/reboot', {});
