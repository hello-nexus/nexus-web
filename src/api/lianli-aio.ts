import { fetchService, putService } from './service';

export interface Galahad2State {
  isConnected: boolean;
  fanRpm: number;
  pumpRpm: number;
  fanDuty: number;
  pumpDuty: number;
}

export interface Galahad2LightingMode {
  key: string;
  label: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  hasBrightness: boolean;
  colorsMin: number;
  colorsMax: number;
}

export interface Galahad2Lighting {
  mode: string;
  /** The animation the device plays when the Lighting page is not driving it. Absent on an older service. */
  effectMode?: string;
  speed: number;
  direction: number;
  brightness: number;
  innerColor: string;
  outerColor: string;
  colors: string[];
  modes: Galahad2LightingMode[];
}

export type Galahad2LightingPatch = Partial<Pick<Galahad2Lighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'innerColor' | 'outerColor' | 'colors'>>;

export function getGalahad2State(): Promise<Galahad2State | null> {
  return fetchService<Galahad2State>('/devices/lianli-aio/state');
}

export function getGalahad2Lighting(): Promise<Galahad2Lighting | null> {
  return fetchService<Galahad2Lighting>('/devices/lianli-aio/lighting');
}

export function setGalahad2Lighting(patch: Galahad2LightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli-aio/lighting', patch);
}
