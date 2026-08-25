// Per-app volume mixer client - typed wrapper over the local service's
// /system/audio/mixer routes. Strips arrive live on the `audio/mixer`
// multiplex topic (see hooks/useAudioMixer.ts); these cover the first paint
// and every write.
//
// Windows only in practice: the service reports `supported: false` where no
// per-app level exists (macOS has no API for it) or where the user-session
// helper that reads the sessions is not connected.

import { fetchService, postService } from './service';

export interface AudioSession {
  /** Process name, lowercased, no extension. Stable across an app restart. */
  id: string;
  name: string;
  /** 0-1, same scale as the system volume. */
  volume: number;
  muted: boolean;
  /** 0-1 level meter reading. Only sampled while a mixer is on screen. */
  peak: number;
  /** False once the app holds the endpoint but renders nothing. */
  active: boolean;
}

export interface AudioMixerPresetEntry {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
}

export interface AudioMixerPreset {
  id: string;
  name: string;
  /** Null means the preset leaves the system volume alone. */
  masterVolume: number | null;
  /** Empty means the preset leaves the endpoint alone. */
  outputDeviceId: string;
  outputDeviceName: string;
  inputDeviceId: string;
  inputDeviceName: string;
  apps: AudioMixerPresetEntry[];
}

/** Longest preset name the service keeps; mirrors AudioMixerService. */
export const MAX_PRESET_NAME = 10;
/** Most presets the service keeps; mirrors AudioMixerService. */
export const MAX_PRESETS = 10;

/** The name the service will store; mirrors AudioMixerService.ClampName. */
export function clampPresetName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= MAX_PRESET_NAME ? trimmed : trimmed.slice(0, MAX_PRESET_NAME).trimEnd();
}

/**
 * Whether saving under `name` would collide with a preset other than
 * `exceptId`. The service refuses these; checking here is what keeps the button
 * from offering a save that cannot land.
 */
export function presetNameTaken(
  presets: AudioMixerPreset[],
  name: string,
  exceptId = '',
): boolean {
  const clamped = clampPresetName(name).toLowerCase();
  if (clamped.length === 0) return false;
  return presets.some(p => p.id !== exceptId && p.name.toLowerCase() === clamped);
}

export interface AudioMixerState {
  error: boolean;
  msg: string;
  supported: boolean;
  sessions: AudioSession[];
  stickyLevels: boolean;
  presets: AudioMixerPreset[];
}

/** Live frame on the `audio/mixer` topic. */
export interface AudioMixerFrame {
  supported: boolean;
  sessions: AudioSession[];
  /** Moves when presets or the sticky flag change; refetch the state then. */
  configRevision: number;
}

export const fetchAudioMixer = () =>
  fetchService<AudioMixerState>('/system/audio/mixer');

/** `commit` false is a mid-drag frame: it moves the level without persisting it. */
export const setSessionVolume = (id: string, volume: number, commit: boolean) =>
  postService('/system/audio/mixer/volume', { id, volume, commit });

export const setSessionMuted = (id: string, muted: boolean) =>
  postService('/system/audio/mixer/mute', { id, muted });

export const setMixerSticky = (enabled: boolean) =>
  postService('/system/audio/mixer/sticky', { enabled });

export const clearMixerLevels = () =>
  postService('/system/audio/mixer/levels/clear', {});

export interface SaveMixerPresetBody {
  /** Empty creates a preset; an existing id overwrites it in place. */
  id?: string;
  name: string;
  /** False stores no master level, so applying leaves the system volume alone. */
  includeMaster?: boolean;
  /** False stores no output/input, so applying leaves the endpoints alone. */
  includeDevices?: boolean;
  /** Omitted captures every strip that is running right now. */
  apps?: AudioMixerPresetEntry[];
}

export const saveMixerPreset = (body: SaveMixerPresetBody) =>
  postService<AudioMixerPreset>('/system/audio/mixer/presets', body);

export const renameMixerPreset = (id: string, name: string) =>
  postService('/system/audio/mixer/presets/rename', { id, name });

export const deleteMixerPreset = (id: string) =>
  postService('/system/audio/mixer/presets/delete', { id });

export const applyMixerPreset = (id: string) =>
  postService('/system/audio/mixer/presets/apply', { id });

// ── Output / input device selection ───────────────────────────────────────
// The mixer's strips always follow the current default render endpoint (the
// service enumerates sessions on whatever is default), so switching the output
// here also re-populates the strips.

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  /** "output" or "input". */
  direction: string;
}

export interface AudioDeviceList {
  error: boolean;
  msg: string;
  outputs: AudioDevice[];
  inputs: AudioDevice[];
}

export const fetchAudioDevices = () =>
  fetchService<AudioDeviceList>('/system/audio/devices');

export const setDefaultOutput = (deviceId: string) =>
  postService('/system/audio/default-output', { deviceId });

export const setDefaultInput = (deviceId: string) =>
  postService('/system/audio/default-input', { deviceId });
