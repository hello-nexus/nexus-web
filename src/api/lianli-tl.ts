import { fetchService, postService, putService } from './service';
import type {
  LianLiScreenApi,
  LianLiScreenSettingsPatch,
  LianLiWirelessScreen,
  LianLiWirelessScreenContentExtra,
  LianLiWirelessScreenContentType,
} from './lianli-wireless';

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
  /** The fans play the motherboard ARGB header. Absent on an older service. */
  argbSync?: boolean;
}

export type LianLiTlLightingPatch = Partial<
  Pick<LianLiTlLighting, 'mode' | 'speed' | 'direction' | 'brightness' | 'scope' | 'colors' | 'argbSync'>
>;

export function getLianLiTlLighting(): Promise<LianLiTlLighting | null> {
  return fetchService<LianLiTlLighting>('/devices/lianli-tl/lighting');
}

export function setLianLiTlLighting(patch: LianLiTlLightingPatch): Promise<unknown | null> {
  return putService('/devices/lianli-tl/lighting', patch);
}

interface OkResponse {
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.error !== true;
}

async function getLianLiTlScreens(): Promise<LianLiWirelessScreen[] | null> {
  const r = await fetchService<{ screens: LianLiWirelessScreen[] }>('/devices/lianli-tl/screens');
  return r?.screens ?? null;
}

// TL screens have no brightness or sleep-when-locked; only rotation, the panel switch and the clip frame rate are sent.
async function setLianLiTlScreenSettings(serial: string, settings: LianLiScreenSettingsPatch): Promise<boolean> {
  const { rotation, nexusPanel, fpsCap } = settings;
  if (rotation === undefined && nexusPanel === undefined && fpsCap === undefined) return true;
  return isOk(await postService<OkResponse>('/devices/lianli-tl/screen/settings', {
    serial,
    ...(rotation !== undefined ? { rotation } : {}),
    ...(nexusPanel !== undefined ? { nexusPanel } : {}),
    ...(fpsCap !== undefined ? { fpsCap } : {}),
  }));
}

async function setLianLiTlScreenOrder(serials: string[]): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-tl/screens/order', { serials }));
}

async function setLianLiTlScreenContent(
  serial: string,
  contentType: LianLiWirelessScreenContentType,
  mediaId?: string,
  extra?: LianLiWirelessScreenContentExtra,
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-tl/screen/content', {
    serial,
    contentType,
    ...(mediaId ? { mediaId } : {}),
    ...(extra ?? {}),
  }));
}

export const lianLiTlScreenApi: LianLiScreenApi = {
  getScreens: getLianLiTlScreens,
  setSettings: setLianLiTlScreenSettings,
  setOrder: setLianLiTlScreenOrder,
  setContent: setLianLiTlScreenContent,
};
