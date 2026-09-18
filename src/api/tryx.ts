// Tryx Panorama AIO (cooler-mounted screen) device endpoints. Mirrors the
// downloadable SDK app's tryx.* host actions one-to-one for the native
// curated device page.

import { fetchService, postService, postServiceForm, resolveHttp } from './service';
import { getTokenSync } from './auth';
import { isTryxSimulated } from '../lib/tryxSimulation';
import { serializeCrop, type NormalizedCrop } from '../components/common/MediaCropper/mediaCrop';

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

export interface TryxOverlayItem {
  sensorId: string;
  device: string;
  label: string;
  /** Normalized justification anchor / top of the value text, 0..1. */
  x: number;
  y: number;
}

export interface TryxOverlay {
  items: TryxOverlayItem[];
  font: string;
  /** Percent, 50..150. */
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  docked: boolean;
}

/** Custom-upload slideshow: the gallery widget's four knobs, paced by the service. */
export interface TryxSlideshow {
  enabled: boolean;
  /** Seconds each clip holds; one of SLIDESHOW_INTERVALS. */
  intervalSec: number;
  shuffle: boolean;
  finishVideos: boolean;
}

export const DEFAULT_TRYX_SLIDESHOW: TryxSlideshow = {
  enabled: false,
  intervalSec: 10,
  shuffle: false,
  finishVideos: true,
};

export interface TryxStatus {
  connected: boolean;
  state: TryxState | null;
  // The panel reports no total capacity, so these are used-only figures.
  mediaUsedBytes: number;
  mediaFileCount: number;
  overlay: TryxOverlay;
  /** Absent from a service that predates the slideshow. */
  slideshow?: TryxSlideshow;
}

export interface TryxPreset {
  id: string;
  name: string;
  thumb?: string;
}

export interface TryxMediaItem {
  name: string;
  thumb?: string;
  durationSec: number;
  /** Human name for media Nexus did not upload (from Kanali's library); shown instead of the device filename. */
  label?: string;
}

interface OkResponse {
  ok?: boolean;
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.ok !== false && r.error !== true;
}

// Dev-tools simulated device: a static "connected" snapshot so the page renders
// a wallpaper + overlay with no hardware. Writes are no-ops (the page's own
// optimistic state carries edits); status is served once (the page skips polling
// in sim mode, so this never overrides those edits).
const SIM_STATUS: TryxStatus = {
  connected: true,
  state: {
    serial: 'SIMULATED',
    adbSerial: '',
    portName: 'sim',
    modelName: 'Tryx Panorama',
    productId: '391A:1011',
    screenEnabled: true,
    brightness: 80,
    currentMedia: 'default_01.mp4.h264_2240x1080',
    currentMediaIsCustom: false,
    lastConnectedMs: 0,
    lastFrameMs: 0,
  },
  mediaFileCount: 8,
  mediaUsedBytes: 50305560,
  overlay: {
    // Empty sensorId + distinct groups: the page's reconcile effect fills each
    // from the host's first real CPU/GPU/Memory sensor, so the simulator shows
    // live values on any machine instead of hardware-specific canned ids.
    items: [
      { sensorId: '', device: 'cpu', label: '', x: 0.04, y: 0.10 },
      { sensorId: '', device: 'gpu', label: '', x: 0.04, y: 0.30 },
      { sensorId: '', device: 'memory', label: '', x: 0.04, y: 0.50 },
    ],
    font: 'roboto-regular',
    size: 100,
    color: '#ffffff',
    align: 'left',
    docked: true,
  },
  slideshow: DEFAULT_TRYX_SLIDESHOW,
};

export function getTryxStatus(): Promise<TryxStatus | null> {
  if (isTryxSimulated()) return Promise.resolve(SIM_STATUS);
  return fetchService<TryxStatus>('/tryx/status');
}

export async function setTryxEnabled(enable: boolean): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/enable', { enable }));
}

export async function setTryxBrightness(value: number): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/brightness', { value }));
}

export async function getTryxPresets(): Promise<TryxPreset[]> {
  const r = await fetchService<{ presets: TryxPreset[] }>('/tryx/presets');
  return r?.presets ?? [];
}

export async function setTryxPreset(id: string): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/preset', { id }));
}

export async function getTryxMedia(): Promise<TryxMediaItem[]> {
  if (isTryxSimulated()) return [];
  const r = await fetchService<{ media: TryxMediaItem[] }>('/tryx/media');
  return r?.media ?? [];
}

export async function selectTryxMedia(name: string): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/media/select', { name }));
}

export async function deleteTryxMedia(name: string): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/media/delete', { name }));
}

export async function setTryxSlideshow(slideshow: TryxSlideshow): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/slideshow', slideshow));
}

export async function setTryxOverlay(overlay: {
  items: TryxOverlayItem[];
  font: string;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  docked: boolean;
}): Promise<boolean> {
  if (isTryxSimulated()) return true;
  return isOk(await postService<OkResponse>('/tryx/overlay', overlay));
}

// Panorama screen media resolution (2:1).
export const TRYX_MEDIA_WIDTH = 858;
export const TRYX_MEDIA_HEIGHT = 428;

export async function uploadTryxMedia(
  file: File,
  crop: NormalizedCrop,
  targetWidth = TRYX_MEDIA_WIDTH,
  targetHeight = TRYX_MEDIA_HEIGHT,
): Promise<boolean> {
  if (isTryxSimulated()) return true;
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', serializeCrop(crop));
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

export interface TryxCloudMaterial {
  id: number;
  name: string;
  // Absolute, token-carrying cover URL ready for an <img> src (see tokenParam).
  coverUrl: string;
  installed: boolean;
}

export async function getTryxCloudCatalog(): Promise<TryxCloudMaterial[]> {
  if (isTryxSimulated()) return [];
  const r = await fetchService<{ materials: TryxCloudMaterial[] }>('/tryx/cloud/catalog');
  // The server returns a relative cover path; an <img> load can't send a Bearer
  // header, so make it absolute and carry the session token as a query param.
  const tok = tokenParam();
  return (r?.materials ?? []).map(m => {
    const base = resolveHttp(m.coverUrl);
    return { ...m, coverUrl: tok ? `${base}?${tok}` : base };
  });
}

export interface TryxCloudInstallResult {
  ok: boolean;
  msg: string;
}

// The install is a large download + on-device push (10-60s); no client-side
// timeout is applied, matching every other postService call in this file.
export async function installTryxCloudMaterial(id: number): Promise<TryxCloudInstallResult> {
  if (isTryxSimulated()) return { ok: true, msg: '' };
  const r = await postService<OkResponse>('/tryx/cloud/install', { id });
  return { ok: isOk(r), msg: r?.msg ?? '' };
}
