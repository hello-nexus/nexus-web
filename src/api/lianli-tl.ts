import { fetchService, putService } from './service';

export interface LianLiTlFan {
  port: number;
  fanIndex: number;
  rpm: number;
  duty: number;
}

export interface LianLiTlState {
  isConnected: boolean;
  fans: LianLiTlFan[];
}

export function getLianLiTlState(): Promise<LianLiTlState | null> {
  return fetchService<LianLiTlState>('/devices/lianli-tl/state');
}

export type LianLiTlScope = 'all' | 'top' | 'bottom';

export interface LianLiTlMode {
  key: string;
  label: string;
}

export interface LianLiTlLighting {
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  scope: LianLiTlScope;
  colors: string[];
  modes: LianLiTlMode[];
  maxColors: number;
}

export type LianLiTlLightingPatch = Partial<
  Pick<LianLiTlLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'scope' | 'colors'>
>;

export function getLianLiTlLighting(): Promise<LianLiTlLighting | null> {
  return fetchService<LianLiTlLighting>('/devices/lianli-tl/lighting');
}

export function setLianLiTlLighting(patch: LianLiTlLightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli-tl/lighting', patch);
}
