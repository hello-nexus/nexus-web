import { deleteService, fetchService, postService, putService } from './service';

/** One attached Nollie controller as GET /devices/nollie lists it. */
export interface NollieBoard {
  id: string;
  name: string;
  serial: string;
  channels: number;
  ports: number;
  /** The firmware takes a standalone colour at all (original and legacy boards; OS2 boards do not). */
  supportsStandalone: boolean;
  /** The firmware also offers its built-in effect as the standalone mode. */
  supportsBuiltInEffect: boolean;
  standaloneMode: NollieStandaloneMode;
  /** "#RRGGBB" */
  standaloneColor: string;
}

export type NollieStandaloneMode = 'static' | 'builtin';

export interface NollieStandalonePatch {
  mode?: NollieStandaloneMode;
  color?: string;
}

export function getNollieBoards(): Promise<NollieBoard[] | null> {
  return fetchService<{ boards: NollieBoard[] }>('/devices/nollie').then(r => r?.boards ?? null);
}

export function setNollieStandalone(id: string, patch: NollieStandalonePatch): Promise<unknown | null> {
  return putService(`/devices/nollie/${encodeURIComponent(id)}/standalone`, patch);
}

// ── Dev-tools simulator ──

export interface NollieDevModel {
  /** "VVVV:PPPP" hex, as the service keys its table. */
  id: string;
  name: string;
  channels: number;
}

interface ApiEnvelope { error?: boolean; msg?: string }

export async function getNollieDevModels(): Promise<NollieDevModel[]> {
  const res = await fetchService<{ models: NollieDevModel[] }>('/devices/nollie/dev/models');
  return res?.models ?? [];
}

/** Attaches a board with nothing behind it; the same model twice is a no-op. */
export async function simulateNollie(id: string): Promise<boolean> {
  const r = await postService<ApiEnvelope>('/devices/nollie/dev/simulate', { id });
  return !!r && !r.error;
}

export async function clearSimulatedNollie(): Promise<boolean> {
  const r = await deleteService<ApiEnvelope>('/devices/nollie/dev/simulate');
  return !!r && !r.error;
}

/** Serial prefix the service gives a simulated board. */
export const NOLLIE_SIMULATED_SERIAL_PREFIX = 'SIM-';
