import { authFetchWithStatus, fetchService, putService } from './service';

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
  /** Sends the write-mode close report before the picture is shown. */
  closeWriteMode: boolean;
  /** Experimental: uncompressed frames instead of stored pictures. */
  rawStream: boolean;
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
  ackReplies: number;
  ackTimeouts: number;
  lastUploadAckWaitMs: number;
  lastCommitWaitMs: number;
  rawFramesOk: number;
  rawFramesFailed: number;
  rawActive: boolean;
}

export interface GlacialTuning {
  settings: GlacialTuningSettings;
  stats: GlacialTuningStats;
}

function isTuning(body: GlacialTuning | null): body is GlacialTuning {
  return body !== null && typeof body.settings === 'object' && body.settings !== null
    && typeof body.stats === 'object' && body.stats !== null;
}

/** The service answers 409 to every tuning route while Nexus panel mode is not offered. */
export const GLACIAL_TUNING_UNAVAILABLE = 'unavailable';
export type GlacialTuningUnavailable = typeof GLACIAL_TUNING_UNAVAILABLE;
const CONFLICT = 409;

async function parseJson<T>(response: Response | null): Promise<T | null> {
  if (!response) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getGlacialTuning(signal?: AbortSignal): Promise<GlacialTuning | GlacialTuningUnavailable | null> {
  const { response, status } = await authFetchWithStatus(`${BASE}/tuning`, { cache: 'no-store', signal });
  if (status === CONFLICT) return GLACIAL_TUNING_UNAVAILABLE;
  const body = await parseJson<GlacialTuning>(response);
  return isTuning(body) ? body : null;
}

/** Resolves the fresh tuning, 'unavailable' on a 409, or null when the service refused or did not answer. */
export async function setGlacialTuning(patch: Partial<GlacialTuningSettings>): Promise<GlacialTuning | GlacialTuningUnavailable | null> {
  const { response, status } = await authFetchWithStatus(`${BASE}/tuning`, { method: 'PUT', body: patch });
  if (status === CONFLICT) return GLACIAL_TUNING_UNAVAILABLE;
  const body = await parseJson<GlacialTuning>(response);
  return isTuning(body) ? body : null;
}

export type GlacialTuningAction = 'ok' | 'unavailable' | 'failed';

async function tuningAction(path: string): Promise<GlacialTuningAction> {
  const { response, status } = await authFetchWithStatus(path, { method: 'POST', body: {} });
  if (status === CONFLICT) return GLACIAL_TUNING_UNAVAILABLE;
  const body = await parseJson<{ error: boolean; msg: string }>(response);
  return body !== null && !body.error ? 'ok' : 'failed';
}

export const resetGlacialTuningStats = (): Promise<GlacialTuningAction> => tuningAction(`${BASE}/tuning/reset-stats`);

export const resumeGlacialTuning = (): Promise<GlacialTuningAction> => tuningAction(`${BASE}/tuning/resume`);
