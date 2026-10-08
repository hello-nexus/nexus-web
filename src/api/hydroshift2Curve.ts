import { fetchService, postService, putService } from './service';

export interface HydroShift2CurveHead {
  connected: boolean;
  tilt: number;
  slide: number;
  targetTilt: number;
  targetSlide: number;
  moving: boolean;
  calibrating: boolean;
  tiltMax: number;
  slideMin: number;
  slideMax: number;
}

export type HydroShift2CurveHeadPatch = Partial<Pick<HydroShift2CurveHead, 'tilt' | 'slide'>>;

const BASE = '/devices/lianli-hydroshift2-curve/head';

export function getHydroShift2CurveHead(): Promise<HydroShift2CurveHead | null> {
  return fetchService<HydroShift2CurveHead>(BASE);
}

export function setHydroShift2CurveHead(patch: HydroShift2CurveHeadPatch): Promise<unknown | null> {
  return putService(BASE, patch);
}

export function recalibrateHydroShift2CurveHead(): Promise<unknown | null> {
  return postService(`${BASE}/recalibrate`, {});
}
