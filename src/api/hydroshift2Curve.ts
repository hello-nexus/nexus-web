import { serializeCrop, type NormalizedCrop } from '../components/common/MediaCropper/mediaCrop';
import { fetchService, postService, postServiceForm, putService } from './service';

export interface HydroShift2CurveHead {
  connected: boolean;
  tilt: number;
  slide: number;
  targetTilt: number;
  targetSlide: number;
  moving: boolean;
  calibrating: boolean;
  tiltMax: number;
  slideMin: number;
  slideMax: number;
}

export type HydroShift2CurveHeadPatch = Partial<Pick<HydroShift2CurveHead, 'tilt' | 'slide'>>;

const BASE = '/devices/lianli-hydroshift2-curve/head';

export function getHydroShift2CurveHead(): Promise<HydroShift2CurveHead | null> {
  return fetchService<HydroShift2CurveHead>(BASE);
}

export function setHydroShift2CurveHead(patch: HydroShift2CurveHeadPatch): Promise<unknown | null> {
  return putService(BASE, patch);
}

export function recalibrateHydroShift2CurveHead(): Promise<unknown | null> {
  return postService(`${BASE}/recalibrate`, {});
}

const BASE_DEVICE = '/devices/lianli-hydroshift2-curve';

/** The glass's pixel size; the upload cropper uses the same aspect. */
export const HYDROSHIFT2_CURVE_SCREEN_ASPECT = 2288 / 1080;

export type HydroShift2CurveScreenMode = 'nexus' | 'video';

export const HYDROSHIFT2_CURVE_SAVER_MINUTES = [0, 5, 10, 15, 30, 45, 60] as const;

export interface HydroShift2CurveSettings {
  connected: boolean;
  screenMode: HydroShift2CurveScreenMode;
  video: string | null;
  /** Media currently on the glass: the video in video mode or a running screen saver. */
  playing: string | null;
  screenSaverMinutes: number;
  screenSaverVideo: string | null;
  screenSaverBrightness: number;
  offlineClock: boolean;
  pumpFollowsMotherboard: boolean;
}

export type HydroShift2CurveSettingsPatch = Partial<Omit<HydroShift2CurveSettings, 'connected' | 'playing'>>;

export interface HydroShift2CurveMediaItem {
  name: string;
  label: string;
  thumb: string | null;
  durationSec: number | null;
  /** False while the service is still transcoding the upload. */
  ready: boolean;
}

interface OkResponse {
  error?: boolean;
  msg?: string | null;
  name?: string | null;
}

export function getHydroShift2CurveSettings(): Promise<HydroShift2CurveSettings | null> {
  return fetchService<HydroShift2CurveSettings>(`${BASE_DEVICE}/settings`);
}

export async function setHydroShift2CurveSettings(patch: HydroShift2CurveSettingsPatch): Promise<boolean> {
  const res = await putService<OkResponse>(`${BASE_DEVICE}/settings`, patch);
  return !!res && !res.error;
}

export async function getHydroShift2CurveMedia(): Promise<HydroShift2CurveMediaItem[] | null> {
  const res = await fetchService<{ media: HydroShift2CurveMediaItem[] }>(`${BASE_DEVICE}/media`);
  return res?.media ?? null;
}

/** Resolves to null on success, otherwise the failure message (empty when the service gave none). */
export async function uploadHydroShift2CurveMedia(file: File, crop: NormalizedCrop): Promise<string | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', serializeCrop(crop));
  const res = await postServiceForm<OkResponse>(`${BASE_DEVICE}/media`, form);
  if (res && !res.error) return null;
  return res?.msg ?? '';
}

export async function deleteHydroShift2CurveMedia(name: string): Promise<boolean> {
  const res = await postService<OkResponse>(`${BASE_DEVICE}/media/delete`, { name });
  return !!res && !res.error;
}
