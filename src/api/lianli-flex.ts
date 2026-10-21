import { fetchService, postService, putService } from './service';
import type {
  LianLiChainLightingApi,
  LianLiFansState,
  LianLiScreenApi,
  LianLiScreenSettingsPatch,
  LianLiWirelessLighting,
  LianLiWirelessLightingEffect,
  LianLiWirelessScreen,
  LianLiWirelessScreenContentExtra,
  LianLiWirelessScreenContentType,
} from './lianli-wireless';

const BASE = '/devices/lianli-flex';

/** Prefix of the Flex fan channels in the generic cooling list. */
export const LIANLI_FLEX_CHANNEL_PREFIX = 'lianli-flex:';

interface OkResponse {
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.error !== true;
}

/** The wired state plus the Flex screens on USB whose fans run over the radio. */
export type LianLiFlexState = LianLiFansState & { screenOnlySerials?: string[] };

export function getLianLiFlexState(): Promise<LianLiFlexState | null> {
  return fetchService<LianLiFlexState>(`${BASE}/state`);
}

export const lianLiFlexLightingApi: LianLiChainLightingApi = {
  get: () => fetchService<LianLiWirelessLighting>(`${BASE}/lighting`),
  set: async (mac, patch) => isOk(await putService<OkResponse>(`${BASE}/lighting/${encodeURIComponent(mac)}`, patch)),
  reset: async mac => isOk(await postService<OkResponse>(`${BASE}/reset-lighting`, { mac })),
};

export async function restartLianLiFlexLcd(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/restart-lcd`, { mac }));
}

export async function identifyLianLiFlexFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/identify`, { mac }));
}

async function getScreens(): Promise<LianLiWirelessScreen[] | null> {
  const r = await fetchService<{ screens: LianLiWirelessScreen[] }>(`${BASE}/screens`);
  return r?.screens ?? null;
}

async function setScreenSettings(serial: string, settings: LianLiScreenSettingsPatch): Promise<boolean> {
  const { brightness, rotation, nexusPanel, sleepWhenLocked } = settings;
  if (brightness === undefined && rotation === undefined && nexusPanel === undefined && sleepWhenLocked === undefined) return true;
  return isOk(await postService<OkResponse>(`${BASE}/screen/settings`, {
    serial,
    ...(brightness !== undefined ? { brightness } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(nexusPanel !== undefined ? { nexusPanel } : {}),
    ...(sleepWhenLocked !== undefined ? { sleepWhenLocked } : {}),
  }));
}

async function setScreenOrder(serials: string[]): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/screens/order`, { serials }));
}

async function setScreenContent(
  serial: string,
  contentType: LianLiWirelessScreenContentType,
  mediaId?: string,
  extra?: LianLiWirelessScreenContentExtra,
): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/screen/content`, {
    serial,
    contentType,
    ...(mediaId ? { mediaId } : {}),
    ...(extra ?? {}),
  }));
}

export const lianLiFlexScreenApi: LianLiScreenApi = {
  getScreens,
  setSettings: setScreenSettings,
  setOrder: setScreenOrder,
  setContent: setScreenContent,
};

// ---- Sync lighting ----

export interface LianLiFlexSyncMember {
  mac: string;
  family: string;
  label: string;
  sortIndex: number;
  /** 0 or 1: which way this fan's slice of the shared animation runs. */
  sliceDirection: number;
}

export interface LianLiFlexSync {
  enabled: boolean;
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  modes: LianLiWirelessLightingEffect[];
  members: LianLiFlexSyncMember[];
}

export type LianLiFlexSyncPatch = Partial<Pick<LianLiFlexSync, 'enabled' | 'mode' | 'speed' | 'direction' | 'brightness' | 'colors'>>
  & { members?: { mac: string; sliceDirection: number }[] };

export function getLianLiFlexSync(): Promise<LianLiFlexSync | null> {
  return fetchService<LianLiFlexSync>(`${BASE}/sync`);
}

export async function setLianLiFlexSync(patch: LianLiFlexSyncPatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`${BASE}/sync`, patch));
}
