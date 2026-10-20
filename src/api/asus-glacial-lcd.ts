import { fetchService, putService } from './service';

export type GlacialMode = 'static' | 'animated' | 'monitor';

export interface GlacialSlot {
  category: string;
  sensor: string;
  label: string;
}

export interface GlacialState {
  isConnected: boolean;
  displayOn: boolean;
  mode: GlacialMode;
  staticAsset: number;
  animatedAsset: number;
  /** 1..3. */
  slotCount: number;
  /** Always three entries. */
  slots: GlacialSlot[];
  /** 0-100. */
  brightness: number;
  stayOnWhileAsleep: boolean;
  staticAssets: number[];
  animatedAssets: number[];
}

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
