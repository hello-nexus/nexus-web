import { fetchService, postService, putService } from './service';

export type GlacialMode = 'static' | 'animated' | 'monitor' | 'panel';

export interface GlacialSlot {
  category: string;
  sensor: string;
  label: string;
}

export interface GlacialSlotState extends GlacialSlot {
  /** The sensor the widget reads; an unpicked slot reports its default. */
  resolvedCategory: string;
  resolvedSensor: string;
}

export interface GlacialState {
  isConnected: boolean;
  displayOn: boolean;
  mode: GlacialMode;
  /** False until a mode is set from Nexus; mode, assets and slots are placeholders until then. */
  modeChosen: boolean;
  staticAsset: number;
  animatedAsset: number;
  /** 1..3. */
  slotCount: number;
  /** Always three entries. */
  slots: GlacialSlotState[];
  /** 0-100. */
  brightness: number;
  stayOnWhileAsleep: boolean;
  staticAssets: number[];
  animatedAssets: number[];
  /** Whether Nexus panel mode is offered. Absent or false hides the mode and keeps the native page. */
  panelModeAvailable?: boolean;
}

/** Raised after a settings write so the page router re-reads the mode at once. */
export const GLACIAL_STATE_CHANGED_EVENT = 'nexus:glacial-state-changed';

export interface GlacialSettingsPatch {
  displayOn?: boolean;
  mode?: GlacialMode;
  staticAsset?: number;
  animatedAsset?: number;
  slotCount?: number;
  /** Replaces widgets by index. */
  slots?: GlacialSlot[];
  brightness?: number;
  stayOnWhileAsleep?: boolean;
}

const BASE = '/devices/asus-glacial-lcd';

export async function getGlacialState(): Promise<GlacialState | null> {
  const body = await fetchService<GlacialState>(`${BASE}/state`);
  return body && Array.isArray(body.slots) ? body : null;
}

/** Resolves true when the service accepted the change. */
export async function setGlacialSettings(patch: GlacialSettingsPatch): Promise<boolean> {
  const res = await putService<{ error: boolean; msg: string }>(`${BASE}/settings`, patch);
  return res !== null && !res.error;
}

export type GlacialScaleMode = 'send' | 'upscale';

export interface GlacialTuningSettings {
  /** 0.2..30; 30 is no cap. */
  maxFps: number;
  /** 0..100; 100 is the vendor timing. */
  pacePercent: number;
  replyDriven: boolean;
  /** 25..100. */
  scalePercent: number;
  scaleMode: GlacialScaleMode;
  /** 30..95. */
  jpegQuality: number;
  /** 1..16. */
  chunkKb: number;
  doubleBuffer: boolean;
}

export interface GlacialTuningStats {
  uploadsOk: number;
  uploadsFailed: number;
  lastUploadMs: number;
  uploadsPerSec: number;
  lastFrameBytes: number;
  lastEncodeMs: number;
  lastError: string | null;
  /** ISO timestamp. */
  lastErrorAt: string | null;
  stalled: boolean;
}

export interface GlacialTuning {
  settings: GlacialTuningSettings;
  stats: GlacialTuningStats;
}

function isTuning(body: GlacialTuning | null): body is GlacialTuning {
  return body !== null && typeof body.settings === 'object' && body.settings !== null
    && typeof body.stats === 'object' && body.stats !== null;
}

export async function getGlacialTuning(signal?: AbortSignal): Promise<GlacialTuning | null> {
  const body = await fetchService<GlacialTuning>(`${BASE}/tuning`, signal);
  return isTuning(body) ? body : null;
}

/** Resolves the fresh tuning, or null when the service refused the change. */
export async function setGlacialTuning(patch: Partial<GlacialTuningSettings>): Promise<GlacialTuning | null> {
  const body = await putService<GlacialTuning>(`${BASE}/tuning`, patch);
  return isTuning(body) ? body : null;
}

export async function resetGlacialTuningStats(): Promise<boolean> {
  const res = await postService<{ error: boolean; msg: string }>(`${BASE}/tuning/reset-stats`, {});
  return res !== null && !res.error;
}

export async function resumeGlacialTuning(): Promise<boolean> {
  const res = await postService<{ error: boolean; msg: string }>(`${BASE}/tuning/resume`, {});
  return res !== null && !res.error;
}
