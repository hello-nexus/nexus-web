import type { StageMediaKind } from './mediaLibrary';
import { deleteService, fetchService, postService, postServiceFormResult, resolveHttp, type ServiceRefusal, tokenParam } from './service';

export interface BackgroundMediaItem {
  id: string;
  name: string;
  sourceExt: string;
  type: 'static' | 'animated';
  width: number;
  height: number;
  importedAtUnixMs: number;
  durationSec: number;
  /** Baked with a real alpha channel: the media is png (static) or gif (animated). */
  alpha: boolean;
}

const MEDIA_CHANGED_EVENT = 'nexus-background-media-changed';
const MEDIA_CHANNEL = 'panel-background-media';

/** Tells every mounted media list, in this window and in other windows of the app, that a panel's library changed. */
function broadcastBackgroundMediaChanged(deviceId: string): void {
  window.dispatchEvent(new CustomEvent(MEDIA_CHANGED_EVENT, { detail: { deviceId } }));
  try {
    const channel = new BroadcastChannel(MEDIA_CHANNEL);
    channel.postMessage({ deviceId });
    channel.close();
  } catch {
    // BroadcastChannel is missing in some WebView configs; the same-window event above still fired.
  }
}

/** Calls `cb` when the library of `deviceId` changed anywhere. Returns the unsubscribe. */
export function onBackgroundMediaChanged(deviceId: string, cb: () => void): () => void {
  const onWindowEvent = (e: Event) => { if ((e as CustomEvent<{ deviceId: string }>).detail?.deviceId === deviceId) cb(); };
  window.addEventListener(MEDIA_CHANGED_EVENT, onWindowEvent);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(MEDIA_CHANNEL);
    channel.onmessage = e => { if (e.data?.deviceId === deviceId) cb(); };
  } catch {
    channel = null;
  }
  return () => {
    window.removeEventListener(MEDIA_CHANGED_EVENT, onWindowEvent);
    channel?.close();
  };
}

export const fetchBackgroundMediaLibrary = (deviceId: string) =>
  fetchService<{ items: BackgroundMediaItem[] }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/library`);

// Mirrors the service's request body cap on the stage route.
export const BACKGROUND_MEDIA_MAX_BYTES = 500 * 1024 * 1024;
export const BACKGROUND_MEDIA_MAX_MB = BACKGROUND_MEDIA_MAX_BYTES / (1024 * 1024);

export const isBackgroundMediaTooLarge = (file: { size: number }): boolean => file.size > BACKGROUND_MEDIA_MAX_BYTES;

/** True when the service refused the stage for size (HTTP 413). */
export const isStageTooLargeRefusal = (r: object & { status?: number }): boolean => r.status === 413;

export interface BackgroundMediaStageResult { stageId: string; alpha: boolean; mediaKind?: StageMediaKind; error: boolean; msg: string }

// Stage and commit answer a refusal (oversize, unsupported, unreadable) with
// its message and null only when the service is unreachable, so a folder
// import can count a bad file and carry on.
export async function stageBackgroundMedia(deviceId: string, file: File): Promise<BackgroundMediaStageResult | ServiceRefusal | null> {
  const form = new FormData();
  // Chromium names a directory-picked file by its folder-relative path
  // ("photos/sub/a.jpg"); the bare name keeps the wire identical to a single pick.
  form.append('file', file, file.name);
  return postServiceFormResult<BackgroundMediaStageResult>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage`, form);
}

export function backgroundMediaStageRawUrl(deviceId: string, stageId: string): string {
  const base = resolveHttp(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}/raw`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export function backgroundMediaStagePreviewUrl(deviceId: string, stageId: string): string {
  const base = resolveHttp(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}/preview`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export interface BackgroundMediaCommitResult { item: BackgroundMediaItem | null; error: boolean; msg: string }

export async function commitBackgroundMedia(
  deviceId: string,
  stageId: string,
  crop: string,
  w: number,
  h: number,
  keepTransparency = true,
  fit = false,
): Promise<BackgroundMediaCommitResult | ServiceRefusal | null> {
  const form = new FormData();
  form.append('stageId', stageId);
  form.append('crop', crop);
  form.append('w', String(w));
  form.append('h', String(h));
  form.append('keepTransparency', keepTransparency ? '1' : '0');
  form.append('fit', fit ? '1' : '0');
  const result = await postServiceFormResult<BackgroundMediaCommitResult>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/commit`, form);
  if (result && !result.error && 'item' in result && result.item) broadcastBackgroundMediaChanged(deviceId);
  return result;
}

export async function cancelBackgroundMediaStage(deviceId: string, stageId: string): Promise<void> {
  await deleteService<{ error?: boolean }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}`);
}

export async function deleteBackgroundMedia(deviceId: string, id: string): Promise<boolean> {
  const resp = await deleteService<{ error?: boolean }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/${encodeURIComponent(id)}`);
  const ok = !!resp && resp.error !== true;
  if (ok) broadcastBackgroundMediaChanged(deviceId);
  return ok;
}

export async function openBackgroundMediaFolder(deviceId: string): Promise<boolean> {
  const resp = await postService<{ error?: boolean }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/library/open`, {});
  return !!resp && resp.error !== true;
}

export function backgroundMediaThumbnailPath(deviceId: string, id: string): string {
  return `/panel/devices/${encodeURIComponent(deviceId)}/background-media/${encodeURIComponent(id)}/thumbnail`;
}

// The console user's wallpaper cropped to this panel monitor (width/height in
// native px). `revision` busts the browser cache when the service broadcasts
// a desktopWallpaper change.
export function desktopWallpaperUrl(width: number, height: number, revision: number): string {
  const base = resolveHttp(`/panel/desktop-wallpaper?width=${width}&height=${height}&r=${revision}`);
  const tok = tokenParam();
  return tok ? `${base}&${tok}` : base;
}

export function backgroundMediaFileUrl(deviceId: string, id: string): string {
  const base = resolveHttp(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/${encodeURIComponent(id)}/file`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}
