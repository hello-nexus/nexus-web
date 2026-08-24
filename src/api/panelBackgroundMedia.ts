import { deleteService, fetchService, postService, postServiceForm, resolveHttp, tokenParam } from './service';

export interface BackgroundMediaItem {
  id: string;
  name: string;
  sourceExt: string;
  type: 'static' | 'animated';
  width: number;
  height: number;
  importedAtUnixMs: number;
  durationSec: number;
}

export const fetchBackgroundMediaLibrary = (deviceId: string) =>
  fetchService<{ items: BackgroundMediaItem[] }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/library`);

export async function stageBackgroundMedia(deviceId: string, file: File): Promise<{ stageId: string; error: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('file', file);
  return postServiceForm<{ stageId: string; error: boolean; msg: string }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage`, form);
}

export function backgroundMediaStagePreviewUrl(deviceId: string, stageId: string): string {
  const base = resolveHttp(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}/preview`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export async function commitBackgroundMedia(deviceId: string, stageId: string, crop: string, w: number, h: number): Promise<{ item: BackgroundMediaItem | null; error: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('stageId', stageId);
  form.append('crop', crop);
  form.append('w', String(w));
  form.append('h', String(h));
  return postServiceForm<{ item: BackgroundMediaItem | null; error: boolean; msg: string }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/commit`, form);
}

export async function cancelBackgroundMediaStage(deviceId: string, stageId: string): Promise<void> {
  await deleteService<{ error?: boolean }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}`);
}

export async function deleteBackgroundMedia(deviceId: string, id: string): Promise<boolean> {
  const resp = await deleteService<{ error?: boolean }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/${encodeURIComponent(id)}`);
  return !!resp && resp.error !== true;
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
