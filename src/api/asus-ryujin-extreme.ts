import { fetchService, putService } from './service';

export type RyujinRotation = 0 | 90;

export interface RyujinDisplayState {
  isConnected: boolean;
  /** 10-100. */
  brightness: number;
  rotation: number;
}

export interface RyujinDisplayPatch {
  brightness?: number;
  rotation?: RyujinRotation;
}

export const RYUJIN_MIN_BRIGHTNESS = 10;
export const RYUJIN_MAX_BRIGHTNESS = 100;

const DISPLAY = '/devices/asus-ryujin-extreme/display';

export async function getRyujinDisplay(): Promise<RyujinDisplayState | null> {
  const body = await fetchService<RyujinDisplayState>(DISPLAY);
  return body && typeof body.brightness === 'number' ? body : null;
}

/** Resolves true when the service accepted the change. */
export async function setRyujinDisplay(patch: RyujinDisplayPatch): Promise<boolean> {
  const res = await putService<{ error: boolean; msg: string }>(DISPLAY, patch);
  return res !== null && !res.error;
}
