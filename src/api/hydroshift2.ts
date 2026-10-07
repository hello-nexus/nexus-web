import { fetchService, putService } from './service';

export interface HydroShift2RingMode {
  key: string;
  /** Palette entries the effect uses. */
  colors: number;
  hasDirection: boolean;
  hasSpeed: boolean;
  hasBrightness: boolean;
}

export interface HydroShift2Lighting {
  /** 'canvas' while the Lighting page drives the ring, otherwise the effect key. */
  mode: string;
  effectMode: string;
  speed: number;
  /** 0 clockwise, 1 counter-clockwise. */
  direction: number;
  brightness: number;
  colors: string[];
  modes: HydroShift2RingMode[];
}

export type HydroShift2LightingPatch = Partial<Pick<HydroShift2Lighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors'>>;

export function getHydroShift2Lighting(): Promise<HydroShift2Lighting | null> {
  return fetchService<HydroShift2Lighting>('/devices/lianli-hydroshift2/lighting');
}

export function setHydroShift2Lighting(patch: HydroShift2LightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli-hydroshift2/lighting', patch);
}
