import { fetchService, putService } from './service';

export type RyujinRotation = 0 | 90;
export type RyujinSensorCount = 2 | 3;

export interface RyujinDisplayState {
  isConnected: boolean;
  /** 10-100. */
  brightness: number;
  rotation: number;
  /** Readings the screen shows: 2 or 3. */
  sensorCount: number;
  /** Sensor ids per reading position; always 3 long, the third unused at a count of 2. */
  slots: string[];
  availableSensors: string[];
}

export interface RyujinDisplayPatch {
  brightness?: number;
  rotation?: RyujinRotation;
  sensorCount?: RyujinSensorCount;
  slots?: string[];
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
