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
}

export interface LianLiLighting {
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  modes: LianLiLightingMode[];
}

export type LianLiLightingPatch = Partial<Pick<LianLiLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors'>>;

export interface LianLiCoolingPort {
  port: number;
  mode: 'Manual' | 'Auto';
  dutyPercent: number;
}

export interface LianLiCooling {
  ports: LianLiCoolingPort[];
}

export function getLianLiLighting(): Promise<LianLiLighting | null> {
  return fetchService<LianLiLighting>('/devices/lianli/lighting');
}

export function setLianLiLighting(patch: LianLiLightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli/lighting', patch);
}

export function getLianLiCooling(): Promise<LianLiCooling | null> {
  return fetchService<LianLiCooling>('/devices/lianli/cooling');
}

export function setLianLiPortCooling(
  port: number,
  mode: 'Manual' | 'Auto',
  dutyPercent?: number,
): Promise<unknown | null> {
  return putService('/devices/lianli/cooling', { port, mode, ...(dutyPercent !== undefined && { dutyPercent }) });
}
