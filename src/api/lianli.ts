import { fetchService, putService } from './service';

export interface LianLiState {
  isConnected: boolean;
  rpm: number[];
  fansPerPort: number[];
}

export function getLianLiState(): Promise<LianLiState | null> {
  return fetchService<LianLiState>('/devices/lianli/state');
}

export function setLianLiFanCount(port: number, count: number): Promise<unknown | null> {
  return putService('/devices/lianli/fan-count', { port, count });
}

export interface LianLiLightingMode {
  key: string;
  label: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  hasBrightness: boolean;
  colorsMin: number;
  colorsMax: number;
  /** Has an across-every-port variant on the attached hub. Absent on an older service. */
  mergeable?: boolean;
}

export interface LianLiLighting {
  mode: string;
  /** The animation the device plays when the Lighting page is not driving it. Absent on an older service. */
  effectMode?: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  /** Mergeable modes run as one animation across every port. Absent on an older service. */
  merge?: boolean;
  modes: LianLiLightingMode[];
}

export type LianLiLightingPatch = Partial<Pick<LianLiLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors' | 'merge'>>;

export function getLianLiLighting(): Promise<LianLiLighting | null> {
  return fetchService<LianLiLighting>('/devices/lianli/lighting');
}

export function setLianLiLighting(patch: LianLiLightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli/lighting', patch);
}

