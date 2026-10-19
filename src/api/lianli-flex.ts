import { fetchService, postService, putService } from './service';
import type {
  LianLiChainLightingApi,
  LianLiFansState,
  LianLiScreenApi,
  LianLiScreenSettingsPatch,
  LianLiWirelessLighting,
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

export function getLianLiFlexState(): Promise<LianLiFansState | null> {
  return fetchService<LianLiFansState>(`${BASE}/state`);
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

// Sleep-when-locked is not offered for these screens, so it is never sent.
async function setScreenSettings(serial: string, settings: LianLiScreenSettingsPatch): Promise<boolean> {
  const { brightness, rotation, nexusPanel } = settings;
  if (brightness === undefined && rotation === undefined && nexusPanel === undefined) return true;
  return isOk(await postService<OkResponse>(`${BASE}/screen/settings`, {
    serial,
    ...(brightness !== undefined ? { brightness } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(nexusPanel !== undefined ? { nexusPanel } : {}),
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
