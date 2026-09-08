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

export const fetchBackgroundMediaLibrary = (deviceId: string) =>
  fetchService<{ items: BackgroundMediaItem[] }>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/library`);

export interface BackgroundMediaStageResult { stageId: string; alpha: boolean; error: boolean; msg: string }

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

export function backgroundMediaStagePreviewUrl(deviceId: string, stageId: string): string {
  const base = resolveHttp(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/stage/${encodeURIComponent(stageId)}/preview`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

/**
 * Pixel size of a staged upload's preview frame. The preview is the same
 * oriented frame the cropper measures, so a crop computed from it lands
 * exactly where the cropper's default would.
 */
export function probeBackgroundMediaStageSize(deviceId: string, stageId: string): Promise<{ w: number; h: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = backgroundMediaStagePreviewUrl(deviceId, stageId);
  });
}

export interface BackgroundMediaCommitResult { item: BackgroundMediaItem | null; error: boolean; msg: string }

export async function commitBackgroundMedia(
  deviceId: string,
  stageId: string,
  crop: string,
  w: number,
  h: number,
  keepTransparency = true,
): Promise<BackgroundMediaCommitResult | ServiceRefusal | null> {
  const form = new FormData();
  form.append('stageId', stageId);
  form.append('crop', crop);
  form.append('w', String(w));
  form.append('h', String(h));
  form.append('keepTransparency', keepTransparency ? '1' : '0');
  return postServiceFormResult<BackgroundMediaCommitResult>(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/commit`, form);
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
