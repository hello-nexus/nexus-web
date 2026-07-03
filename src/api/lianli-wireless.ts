import { fetchService, postService, postServiceForm, deleteService } from './service';

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

export type LianLiWirelessScreenContentType =
  | 'off' | 'image' | 'gif' | 'video' | 'sensor' | 'clock' | 'animation';

export interface LianLiWirelessScreen {
  serial: string;
  position: number;
  width: number;
  height: number;
  brightness: number;
  /** Quarter-turns clockwise: 0, 1, 2 or 3 (0/90/180/270 degrees). */
  rotation: number;
  contentType: LianLiWirelessScreenContentType;
  mediaId?: string;
}

export async function getLianLiWirelessScreens(): Promise<LianLiWirelessScreen[] | null> {
  const r = await fetchService<{ screens: LianLiWirelessScreen[] }>('/devices/lianli-wireless/screens');
  return r?.screens ?? null;
}

export async function setLianLiWirelessScreenSettings(
  serial: string,
  settings: { brightness?: number; rotation?: number },
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/screen/settings', { serial, ...settings }));
}

export async function setLianLiWirelessScreenContent(
  serial: string,
  contentType: LianLiWirelessScreenContentType,
  mediaId?: string,
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/screen/content', {
    serial,
    contentType,
    ...(mediaId ? { mediaId } : {}),
  }));
}

export type LianLiWirelessMediaKind = 'image' | 'gif' | 'video';

export interface LianLiWirelessMediaItem {
  id: string;
  name: string;
  kind: LianLiWirelessMediaKind;
}

export async function getLianLiWirelessMedia(): Promise<LianLiWirelessMediaItem[]> {
  const r = await fetchService<{ items: LianLiWirelessMediaItem[] }>('/devices/lianli-wireless/media');
  return r?.items ?? [];
}

// LCD screens are a fixed 400x400 square; every upload is cropped to that
// aspect before it reaches the service, mirroring uploadTryxMedia's
// crop-before-upload flow (src/api/tryx.ts).
export const LIANLI_WIRELESS_MEDIA_WIDTH = 400;
export const LIANLI_WIRELESS_MEDIA_HEIGHT = 400;

export interface LianLiWirelessMediaCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MediaImportResponse extends OkResponse {
  mediaId?: string;
  name?: string;
  kind?: LianLiWirelessMediaKind;
}

export async function importLianLiWirelessMedia(
  file: File,
  crop: LianLiWirelessMediaCrop,
): Promise<LianLiWirelessMediaItem | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`);
  form.append('targetWidth', String(LIANLI_WIRELESS_MEDIA_WIDTH));
  form.append('targetHeight', String(LIANLI_WIRELESS_MEDIA_HEIGHT));
  const r = await postServiceForm<MediaImportResponse>('/devices/lianli-wireless/media/import', form);
  if (!r || r.error || !r.mediaId) return null;
  return { id: r.mediaId, name: r.name ?? file.name, kind: r.kind ?? 'image' };
}

export async function deleteLianLiWirelessMedia(id: string): Promise<boolean> {
  return isOk(await deleteService<OkResponse>(`/devices/lianli-wireless/media/${encodeURIComponent(id)}`));
}
