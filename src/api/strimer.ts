import { fetchService, putService } from './service';

export interface StrimerLightingMode {
  key: string;
  label: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  hasBrightness: boolean;
  colorsMin: number;
  colorsMax: number;
}

export interface StrimerLighting {
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  modes: StrimerLightingMode[];
}

export type StrimerLightingPatch = Partial<Pick<StrimerLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors'>>;

export function getStrimerLighting(): Promise<StrimerLighting | null> {
  return fetchService<StrimerLighting>('/devices/strimer/lighting');
}

export function setStrimerLighting(patch: StrimerLightingPatch): Promise<unknown | null> {
  return putService('/devices/strimer/lighting', patch);
}
