// Cooling API wrapper — authenticated fetch/post to the local service.

import { fetchService, postService } from './service';

// ── Types ──

export interface FanChannel {
  id: string;
  name: string;
  dutyPercent: number;
  rpm: number;
  mode: string; // "Auto" | "Manual" | "Curve"
  minRpm?: number | null;
  maxRpm?: number | null;
  minDuty?: number | null;
  classification?: string | null; // "Controllable" | "Fixed" | "Stalling" | "Unresponsive"
  calibrated?: boolean;
  // ── External-device metadata.
  // All null for motherboard/GPU fans; populated by the service only when the
  // channel lives on a USB hub like NP50. Drives device-grouped rendering on
  // the cooling page.
  deviceId?: string | null;     // e.g. "np50:1A2B3C"
  portLabel?: string | null;    // e.g. "Port 1" | "Legacy 4-pin"
  fanModel?: string | null;     // e.g. "LS30" | "LS10" | "FP12"
  orientation?: string | null;  // "Back" | "Down" | "Up" | "Front"
}

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
}

interface TemperatureSourcesResponse {
  sources: TemperatureSource[];
}

interface CurvesResponse {
  globalSpeedModifier: number;
  curves: Array<{
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
    preset?: 'silent' | 'balanced' | 'turbo' | null;
    /** For preset curves only: true when the curve's Type + Linear params
     *  still match the service's PresetDefaults. Drives the Reset button's
     *  enabled state. Null for user curves. */
    isDefault?: boolean | null;
  }>;
}

interface ProfilesResponse {
  profiles: FanProfile[];
  active: string;
}

interface CoolingAllResponse {
  coolingComponents: CoolingComponent[];
}

// ── REST wrappers ──

export const fetchCoolingAll = () =>
  fetchService<CoolingAllResponse>('/cooling/all');

export const fetchCurves = () =>
  fetchService<CurvesResponse>('/cooling/curves');

export const fetchFanChannels = () =>
  fetchService<FanChannelsResponse>('/cooling/fans');

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

export const saveCurves = (body: {
  globalSpeedModifier: number;
  curves: Array<{
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
    preset?: 'silent' | 'balanced' | 'turbo' | null;
  }>;
}) => postService('/cooling/curves/set', body);

export const startCalibration = (fanIds: string[]) =>
  postService<{ sessionId: string; error: boolean; msg: string }>('/cooling/calibrate', { fanIds });

export const fetchCalibrations = () =>
  fetchService<{ calibrations: FanCalibration[] }>('/cooling/calibrations');
