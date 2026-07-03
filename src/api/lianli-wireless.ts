import { fetchService, postService } from './service';

export interface LianLiWirelessFan {
  mac: string;
  /** Bound master MAC, or empty when unbound. */
  masterMac: string;
  boundToUs: boolean;
  channel: number;
  /** rx_type slot (1..14); 0 or 0xFE means unbound. */
  slot: number;
  devType: number;
  /** Fan subtype: 24 SLV3-LCD, 20-23 SLV3-LED, 36-39 SL-Infinity. */
  fanType: number;
  fanCount: number;
  rpm: number[];
  pwm: number[];
}

export interface LianLiWirelessState {
  isConnected: boolean;
  masterMac: string;
  channel: number;
  txFirmwareVersion: number;
  fans: LianLiWirelessFan[];
}

export function getLianLiWirelessState(): Promise<LianLiWirelessState | null> {
  return fetchService<LianLiWirelessState>('/devices/lianli-wireless/state');
}

interface OkResponse {
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.error !== true;
}

export async function bindLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/bind', { mac }));
}

export async function unbindLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/unbind', { mac }));
}

export async function identifyLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/identify', { mac }));
}
