import { fetchService, putService } from './service';

/** The first wired Uni hub; the others are `lianli2` onward, named to the endpoints by `?hub=`. */
export const LIANLI_PRIMARY_HUB = 'lianli';

/** Whether a device id is a wired Uni hub: the service runs up to four. */
export function isLianLiHubId(id: string | undefined): id is string {
  return id !== undefined && /^lianli[2-4]?$/.test(id);
}

/** Display name of a wired hub; one past the first carries its number. */
export function lianLiHubName(hubId: string): string {
  const n = hubId.slice(LIANLI_PRIMARY_HUB.length);
  return n ? `Lian Li Uni Hub ${n}` : 'Lian Li Uni Hub';
}

/** The primary hub sends no query, so a service without multi-hub support still answers. */
export function lianLiHubQuery(hubId: string): string {
  return hubId === LIANLI_PRIMARY_HUB ? '' : `?hub=${encodeURIComponent(hubId)}`;
}

export interface LianLiState {
  isConnected: boolean;
  rpm: number[];
  fansPerPort: number[];
  /** Fans the attached hub family chains on one port. Absent on an older service. */
  maxFansPerPort?: number;
  /** Hub firmware version; empty until read, absent on an older service. */
  firmwareVersion?: string;
}

export function getLianLiState(hubId = LIANLI_PRIMARY_HUB): Promise<LianLiState | null> {
  return fetchService<LianLiState>(`/devices/lianli/state${lianLiHubQuery(hubId)}`);
}

export function setLianLiFanCount(port: number, count: number, hubId = LIANLI_PRIMARY_HUB): Promise<unknown | null> {
  return putService(`/devices/lianli/fan-count${lianLiHubQuery(hubId)}`, { port, count });
}

export interface LianLiLightingMode {
  key: string;
  label: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  hasBrightness: boolean;
  colorsMin: number;
  colorsMax: number;
  /** Palette the mode starts from, as #RRGGBB. Absent on an older service. */
  defaultColors?: string[];
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
  /** The hub plays its motherboard ARGB input instead of Nexus streaming to it. Absent on an older service. */
  argbSync?: boolean;
  /** False on a service older than plain passthrough, where only the verified family could sync. */
  argbSyncSupported?: boolean;
  /** False when the hub's input layout is unverified: sync then hands the fans to the motherboard without a Nexus source. */
  argbSyncSourcesSupported?: boolean;
  /** Lighting card driving that ARGB input. */
  argbSyncSource?: string | null;
  /** Cards that can drive it: single addressable ports. */
  argbSyncSources?: { id: string; name: string }[];
}

export type LianLiLightingPatch = Partial<Pick<LianLiLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'colors' | 'merge' | 'argbSync'>>
  & { argbSyncSource?: string };

export function getLianLiLighting(hubId = LIANLI_PRIMARY_HUB): Promise<LianLiLighting | null> {
  return fetchService<LianLiLighting>(`/devices/lianli/lighting${lianLiHubQuery(hubId)}`);
}

export function setLianLiLighting(patch: LianLiLightingPatch, hubId = LIANLI_PRIMARY_HUB): Promise<unknown | null> {
  return putService(`/devices/lianli/lighting${lianLiHubQuery(hubId)}`, patch);
}

