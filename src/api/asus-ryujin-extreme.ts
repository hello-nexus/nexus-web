import { fetchService, isTunnelActive, postServiceFormResult, putService } from './service';

export type RyujinRotation = 0 | 90;
export type RyujinSensorCount = 2 | 3;
export type RyujinScreenMode = 'monitor' | 'image';
export type RyujinUploadPhase = 'idle' | 'uploading' | 'done' | 'failed';

export interface RyujinDisplayState {
  isConnected: boolean;
  /** 10-100. */
  brightness: number;
  rotation: number;
  sensorCount: RyujinSensorCount;
  /** Sensor ids per reading position; the unused third slot is still sent. */
  slots: string[];
  availableSensors: string[];
  screenMode: RyujinScreenMode;
  /** File name of the picked picture or GIF; empty when none. */
  mediaName: string;
  /** True once the cooler holds the picked file. */
  mediaHeld: boolean;
  uploadState: RyujinUploadPhase;
  uploadSent: number;
  uploadTotal: number;
  /** The service's reason when uploadState is failed. */
  uploadMessage: string;
  /** Why an upload failed: failed, controlOff, bulkUnavailable or bulkInUse; empty otherwise. */
  uploadReason: string;
}

export interface RyujinDisplayPatch {
  brightness?: number;
  rotation?: RyujinRotation;
  sensorCount?: RyujinSensorCount;
  slots?: string[];
  screenMode?: RyujinScreenMode;
}

export const RYUJIN_MIN_BRIGHTNESS = 10;
export const RYUJIN_MAX_BRIGHTNESS = 100;

const DISPLAY = '/devices/asus-ryujin-extreme/display';

export async function getRyujinDisplay(): Promise<RyujinDisplayState | null> {
  const body = await fetchService<RyujinDisplayState>(DISPLAY);
  return body && typeof body.brightness === 'number' ? body : null;
}

/** Resolves true when the service accepted the change. */
export async function setRyujinDisplay(patch: RyujinDisplayPatch): Promise<boolean> {
  const res = await putService<{ error: boolean; msg: string }>(DISPLAY, patch);
  return res !== null && !res.error;
}

/** The picker posts a file, which the remote tunnel cannot carry. */
export function canUploadRyujinMedia(): boolean {
  return !isTunnelActive();
}

/** Converts the file and queues it for upload to the cooler; the service sends it on its next cycle. Null on a transport failure. */
export async function uploadRyujinMedia(file: File): Promise<{ ok: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await postServiceFormResult<{ error: boolean; msg: string }>(`${DISPLAY}/media`, form);
  return res === null ? null : { ok: !res.error, msg: res.msg };
}
