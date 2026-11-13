import { fetchService, putService } from './service';

export interface StrimerLightingMode {
  key: string;
  label: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  hasBrightness: boolean;
  colorsMin: number;
  colorsMax: number;
  /** Palette the mode starts from, as #RRGGBB. Absent on an older service. */
  defaultColors?: string[];
  /** Runs across a whole cable, so a single port cannot play it. Absent on an older service. */
  complete?: boolean;
}

/** A cable ("ch0" 24-pin, "ch1" 8-pin) or port ("p0".."p11") playing its own effect. */
export interface StrimerLook {
  target: string;
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
}

export interface StrimerLighting {
  mode: string;
  /** The animation the device plays when the Lighting page is not driving it. Absent on an older service. */
  effectMode?: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  modes: StrimerLightingMode[];
  /** The cable plays the motherboard ARGB header. Absent on an older service. */
  argbSync?: boolean;
  /** Cables and ports with their own effect; the rest follow the shared one. Absent on an older service. */
  looks?: StrimerLook[];
  /** Strips on the 8-pin cable. Absent on an older service. */
  gpuZones?: number;
}

export type StrimerLightingPatch = Partial<Pick<StrimerLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors' | 'argbSync'>> & {
  /** "all" or absent for the shared effect, a cable or port key otherwise. */
  target?: string;
  /** Drops the target's own effect so it follows the shared one again. */
  resetTarget?: boolean;
};

export function getStrimerLighting(): Promise<StrimerLighting | null> {
  return fetchService<StrimerLighting>('/devices/strimer/lighting');
}

export function setStrimerLighting(patch: StrimerLightingPatch): Promise<unknown | null> {
  return putService('/devices/strimer/lighting', patch);
}
