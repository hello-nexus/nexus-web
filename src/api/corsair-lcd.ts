import { serializeCrop, type NormalizedCrop } from '../components/common/MediaCropper/mediaCrop';
import { authFetchWithStatus, fetchService, postServiceFormResult, putService } from './service';

/** Live state of the iCUE LINK cooler's LCD module. */
export interface CorsairLcdState {
  hasDevice: boolean;
  selectedMediaId: string | null;
  brightness: number;
  rotation: number;
  /** Library item stored in the cooler's flash, shown while Nexus is closed; null/absent is the built-in coolant screen. */
  deviceMediaId?: string | null;
}

export interface CorsairLcdPatch {
  brightness?: number;
  rotation?: number;
  mediaId?: string;
}

export function getCorsairLcdState(): Promise<CorsairLcdState | null> {
  return fetchService<CorsairLcdState>('/devices/corsair/lcd/state');
}

export function setCorsairLcd(patch: CorsairLcdPatch): Promise<unknown | null> {
  return putService('/devices/corsair/lcd/settings', patch);
}

export interface CorsairLcdMediaItem {
  id: string;
  name: string;
  type: 'static' | 'animated';
}

export function getCorsairLcdMedia(): Promise<{ items: CorsairLcdMediaItem[] } | null> {
  return fetchService<{ items: CorsairLcdMediaItem[] }>('/devices/corsair/lcd/media');
}

/** The new library item, or null when the upload was refused or the service was unreachable. */
export async function uploadCorsairLcdMedia(file: File, crop?: NormalizedCrop): Promise<CorsairLcdMediaItem | null> {
  const form = new FormData();
  form.append('file', file);
  if (crop) form.append('crop', serializeCrop(crop));
  const r = await postServiceFormResult<{ error: boolean; msg: string; item?: CorsairLcdMediaItem }>(
    '/devices/corsair/lcd/media/upload',
    form,
  );
  if (!r || r.error || !('item' in r) || !r.item) return null;
  return r.item;
}

/**
 * Stores a library item on the cooler (null restores the coolant-temperature screen).
 * Resolves to null on success, else the HTTP status (zero when the service was unreachable).
 */
export async function setCorsairDeviceScreen(mediaId: string | null): Promise<number | null> {
  const { response, status } = await authFetchWithStatus('/devices/corsair/lcd/device-screen', {
    method: 'PUT',
    body: { mediaId },
  });
  if (!response) return status;
  let body: { error?: boolean } | null = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status decides.
  }
  return status >= 200 && status < 300 && !body?.error ? null : status;
}
