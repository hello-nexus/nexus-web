// Tryx Panorama AIO (cooler-mounted screen) device endpoints. Mirrors the
// downloadable SDK app's tryx.* host actions one-to-one for the native
// curated device page.

import { fetchService, postService, postServiceForm, resolveHttp } from './service';
import { getTokenSync } from './auth';

// <video>/<img> element loads can't send a Bearer header, so the authenticated
// media-file URL carries the session token as a query param (the server's
// ExtractBearerOrQueryToken accepts ?token=), same as the WS URL.
function tokenParam(): string {
  const t = getTokenSync();
  return t ? `token=${encodeURIComponent(t)}` : '';
}

export interface TryxState {
  serial: string;
  adbSerial: string;
  portName: string;
  modelName: string;
  productId: string;
  screenEnabled: boolean;
  brightness: number;
  currentMedia: string;
  currentMediaIsCustom: boolean;
  lastConnectedMs: number;
  lastFrameMs: number;
}

export interface TryxOverlay {
  stats: string[];
  color: string;
  align: string;
}

export interface TryxStatus {
  connected: boolean;
  state: TryxState | null;
  overlay: TryxOverlay;
}

export interface TryxPreset {
  id: string;
  name: string;
}

export interface TryxMediaItem {
  name: string;
  thumb?: string;
  durationSec: number;
}

interface OkResponse {
  ok?: boolean;
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.ok !== false && r.error !== true;
}

export function getTryxStatus(): Promise<TryxStatus | null> {
  return fetchService<TryxStatus>('/tryx/status');
}

export async function setTryxEnabled(enable: boolean): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/enable', { enable }));
}

export async function setTryxBrightness(value: number): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/brightness', { value }));
}

export type TryxFanMode = 'smart' | 'fixed';

export async function setTryxFan(
  mode: TryxFanMode,
  options: { fixed?: number; curve?: number[][] } = {},
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/fan', { mode, ...options }));
}

export async function getTryxPresets(): Promise<TryxPreset[]> {
  const r = await fetchService<{ presets: TryxPreset[] }>('/tryx/presets');
  return r?.presets ?? [];
}

export async function setTryxPreset(id: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/preset', { id }));
}

export async function getTryxMedia(): Promise<TryxMediaItem[]> {
  const r = await fetchService<{ media: TryxMediaItem[] }>('/tryx/media');
  return r?.media ?? [];
}

export async function selectTryxMedia(name: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/media/select', { name }));
}

export async function deleteTryxMedia(name: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/media/delete', { name }));
}

export async function setTryxOverlay(overlay: {
  stats: string[];
  color: string;
  align: string;
  filter?: string;
  opacity?: number;
}): Promise<boolean> {
  return isOk(await postService<OkResponse>('/tryx/overlay', overlay));
}

export interface TryxMediaCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Panorama screen media resolution (2:1).
export const TRYX_MEDIA_WIDTH = 858;
export const TRYX_MEDIA_HEIGHT = 428;

export async function uploadTryxMedia(
  file: File,
  crop: TryxMediaCrop,
  targetWidth = TRYX_MEDIA_WIDTH,
  targetHeight = TRYX_MEDIA_HEIGHT,
): Promise<boolean> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`);
  form.append('targetWidth', String(targetWidth));
  form.append('targetHeight', String(targetHeight));
  return isOk(await postServiceForm<OkResponse>('/tryx/media', form));
}

/** Authenticated streaming URL for a custom media clip, for a <video> source. */
export function tryxMediaFileUrl(name: string): string {
  const base = resolveHttp(`/tryx/media/file?name=${encodeURIComponent(name)}`);
  const tok = tokenParam();
  return tok ? `${base}&${tok}` : base;
}
