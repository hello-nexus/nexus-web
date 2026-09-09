// Cooling API wrapper - authenticated fetch/post to the local service.

import { fetchService, postService, putService, deleteService } from './service';
import { type DeviceGroup } from '../lib/deviceGroups';

// ── Types ──

/** Device the fan is marked as cooling. Drives the fan card's header icon
 *  (Fan / Cpu / Gpu). "none" is a plain, unmarked fan. */
export type FanRole = 'none' | 'cpu' | 'gpu';

export interface FanChannel {
  /** The hardware name a rename replaced. Set only on a renamed channel. */
  originalName?: string;
  /** The hardware name the group header's rename replaced. Set only when renamed. */
  originalDeviceName?: string;
  id: string;
  name: string;
  dutyPercent: number;
  rpm: number;
  mode: string; // "Auto" | "Manual" | "Curve"
  kind?: string; // "Fan" | "Pump" - hardware channel type reported by the service
  locked?: boolean; // skipped by the global preset buttons; still settable from the mode dropdown
  controlled?: boolean; // false = Nexus drives no duty onto this channel and no preset reclaims it; undefined means controlled
  readOnly?: boolean; // telemetry-only channel: header readout, no duty bar / mode control
  rpmUnavailable?: boolean; // duty is controllable but RPM cannot be read (SLV3 wireless chain that does not enumerate its fans)
  minRpm?: number | null;
  maxRpm?: number | null;
  minDuty?: number | null;
  classification?: string | null; // "Controllable" | "Fixed" | "Stalling" | "Unresponsive"
  calibrated?: boolean;
  role?: FanRole;
  /** Enumerated from a GPU hardware node. Motherboard-header fans are the deviceId-less channels where this is false. */
  isGpu?: boolean;
  /** Duty points added to whatever drives this fan, in [-100,100]. 0 when it has none. */
  offset?: number;
  seriesId?: string; // sanitized id; "fan:" + seriesId is the monitoring series id
  // ── External-device metadata.
  // All null for motherboard/GPU fans; populated by the service only when the
  // channel lives on a USB hub like NP50. Drives device-grouped rendering on
  // the cooling page.
  deviceId?: string | null;     // e.g. "np50:1A2B3C"
  // Product name from the service (e.g. "HYTE NP50" or "iBUYPOWER MiniHub").
  // Same for every channel on a device; used as the device-group header
  // label on the cooling page.
  deviceName?: string | null;
  portLabel?: string | null;    // e.g. "Port 1" | "Legacy 4-pin"
  fanModel?: string | null;     // e.g. "LS30" | "LS10" | "FP12"
  orientation?: string | null;  // "Back" | "Down" | "Up" | "Front"
}

/**
 * A fan counts as disconnected only when calibration marked it Unresponsive
 * AND it is not currently spinning. Live RPM is ground truth: a fan reporting
 * RPM is physically connected, so a stale Unresponsive label (e.g. from a
 * calibration run while the fan was stopped) must not hide it. Re-calibration
 * refreshes the label; until then this recovers it immediately.
 */
export const isFanDisconnected = (c: FanChannel): boolean =>
  c.classification === 'Unresponsive' && (c.rpm ?? 0) <= 0;

export interface FanCalibrationPoint {
  duty: number;
  rpm: number;
}

export interface FanCalibration {
  fanId: string;
  classification: string;
  minRpm: number;
  maxRpm: number;
  minDuty: number;
  curve: FanCalibrationPoint[];
  calibratedAtUnixMs: number;
}

export interface TemperatureSource {
  id: string;
  name: string;
  category: string; // "CPU" | "GPU" | "Motherboard" | "Storage"
  value: number;
}

export interface CoolingComponent {
  id: string;
  name: string;
  type: string;
  devices: Array<{
    id: string;
    name: string;
    type: string;
    speed: number | null;
    rpm: number | null;
    temperature: number | null;
    pwm: number | null;
  }>;
}

export interface FanProfile {
  name: string;
  description: string;
}

export interface CurvePoint {
  temp: number;
  speed: number;
}

// ── API responses ──

interface FanChannelsResponse {
  channels: FanChannel[];
  /** User-made fan groups, in display order. Absent on older services. */
  groups?: DeviceGroup[];
}

interface TemperatureSourcesResponse {
  sources: TemperatureSource[];
}

/** One curve as the service stores and returns it. */
export interface WireCurve {
  id: string;
  name: string;
  type: string;
  input: { id: string; type: string; device: string };
  outputs: Array<{ id: string; type: string }>;
  flat?: { speed: number } | null;
  linear?: {
    responseTime: number;
    minTemp: number;
    maxTemp: number;
    minSpeed: number;
    maxSpeed: number;
  } | null;
  graph?: {
    responseTime: number;
    speedModifier: number;
    points: CurvePoint[];
  } | null;
  mixed?: {
    responseTime: number;
    curveIds: string[];
    fn: string;
  } | null;
  trigger?: {
    responseTime: number;
    idleTemp: number;
    loadTemp: number;
    idleSpeed: number;
    loadSpeed: number;
  } | null;
  sync?: {
    sourceChannelId: string;
    offset: number;
    proportional: boolean;
  } | null;
  auto?: {
    responseTime: number;
    idleTemp: number;
    loadTemp: number;
    minSpeed: number;
    maxSpeed: number;
    step: number;
    deadband: number;
  } | null;
  preset?: 'silent' | 'balanced' | 'turbo' | 'max' | null;
  /** For preset curves only: true when the curve's Type + Linear params
   *  still match the service's PresetDefaults. Drives the Reset button's
   *  enabled state. Null for user curves. */
  isDefault?: boolean | null;
}

export interface CurvesResponse {
  globalSpeedModifier: number;
  curves: WireCurve[];
}

interface ProfilesResponse {
  profiles: FanProfile[];
  active: string;
}

// ── REST wrappers ──

export const fetchCurves = () =>
  fetchService<CurvesResponse>('/cooling/curves');

export const fetchFanChannels = () =>
  fetchService<FanChannelsResponse>('/cooling/fans');

/** Whole-list replace; the page owns group order and membership. */
export const saveFanGroups = (groups: DeviceGroup[]) =>
  putService<{ groups: DeviceGroup[] }>('/cooling/fan-groups', { groups });

export const fetchTemperatureSources = () =>
  fetchService<TemperatureSourcesResponse>('/cooling/sources');

export const fetchProfiles = () =>
  fetchService<ProfilesResponse>('/cooling/profiles');

export const setFanSpeed = (id: string, speed: number) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/speed`, { speed });

export const releaseFanAuto = (id: string) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/auto`, {});

export const applyProfile = (name: string) =>
  postService(`/cooling/profile/${encodeURIComponent(name)}`, {});

export const resetPresetCurve = (name: string) =>
  postService(`/cooling/profile/${encodeURIComponent(name)}/reset`, {});

export const renameFan = (id: string, name: string) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/name`, { name });

export const setFanLock = (id: string, locked: boolean) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/lock`, { locked });

export const setFanControlled = (id: string, controlled: boolean) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/controlled`, { controlled });

export const setFanRole = (id: string, role: FanRole) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/role`, { role });

/** Shifts this fan off whatever drives it. 0 removes the offset. */
export const setFanOffset = (id: string, offset: number) =>
  postService(`/cooling/fan/${encodeURIComponent(id)}/offset`, { offset });

export const saveCurves = (body: {
  globalSpeedModifier: number;
  curves: WireCurve[];
}) => postService('/cooling/curves/set', body);

export const startCalibration = (fanIds: string[]) =>
  postService<{ sessionId: string; error: boolean; msg: string }>('/cooling/calibrate', { fanIds });

/** The last run's results. Each live fan's stored calibration arrives on its
 *  channel from /cooling/fans instead. */
export const fetchCalibrationResults = () =>
  fetchService<{ calibrations: FanCalibration[] }>('/cooling/calibration/results');

// ----- User-saved cooling presets -----

/** A saved cooling configuration. `mode` is the built-in mode it restores. */
export interface CoolingPreset {
  id: string;
  name: string;
  mode: CoolingPresetMode;
}

export type CoolingPresetMode = 'off' | 'silent' | 'balanced' | 'turbo' | 'custom';

export interface CoolingPresetsResponse {
  presets: CoolingPreset[];
  /** Null when no preset is loaded. */
  activeId: string | null;
}

export const fetchCoolingPresets = () =>
  fetchService<CoolingPresetsResponse>('/cooling/presets');

/** `preset` is null on the error paths (blank name, cap reached). */
export const createCoolingPreset = (name: string) =>
  postService<{ preset: CoolingPreset | null; activeId: string | null; error: boolean; msg: string }>(
    '/cooling/presets', { name });

/** saveCurrent re-captures the live configuration into the preset. */
export const updateCoolingPreset = (id: string, body: { name?: string; saveCurrent?: boolean }) =>
  putService('/cooling/presets/' + encodeURIComponent(id), body);

export const deleteCoolingPreset = (id: string) =>
  deleteService<{ activeId: string | null }>('/cooling/presets/' + encodeURIComponent(id));

export const setActiveCoolingPreset = (id: string | null) =>
  putService('/cooling/presets/active', { id });

export const activateCoolingPreset = (id: string) =>
  postService('/cooling/presets/' + encodeURIComponent(id) + '/activate', {});
