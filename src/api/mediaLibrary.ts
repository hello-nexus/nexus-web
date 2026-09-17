import { deleteService, fetchService, postService, postServiceForm, resolveHttp, tokenParam } from './service';

export interface MediaItem {
  id: string;
  name: string;
  type: 'static' | 'animated';
  frames: number;
  fps: number;
  width: number;
  height: number;
  importedAtUnixMs: number;
}

export const fetchMediaLibrary = () =>
  fetchService<{ items: MediaItem[] }>('/media/library');

export const fetchMediaCurrent = () =>
  fetchService<{ mediaId: string | null; item: MediaItem | null }>('/media/current');

export async function playMedia(id: string): Promise<boolean> {
  const resp = await postService<{ error?: boolean }>('/media/' + encodeURIComponent(id) + '/play', {});
  return !!resp && resp.error !== true;
}

// Media mode with no playable media: black output while the lighting sync stays
// "media", so the panel keeps the Media tab selected instead of falling to Off.
export async function mediaIdle(): Promise<void> {
  await postService<{ error?: boolean }>('/media/idle', {});
}

export async function playCurrentOrFirstMedia(): Promise<string | null> {
  const current = await fetchMediaCurrent();
  if (current?.mediaId && current.item && await playMedia(current.mediaId)) {
    return current.mediaId;
  }

  const library = await fetchMediaLibrary();
  const first = library?.items?.[0];
  if (first && await playMedia(first.id)) {
    return first.id;
  }

  return null;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const resp = await deleteService<{ error?: boolean }>(`/media/${encodeURIComponent(id)}`);
  return !!resp && resp.error !== true;
}

export async function openMediaFolder(): Promise<boolean> {
  const resp = await postService<{ error?: boolean }>('/media/library/open', {});
  return !!resp && resp.error !== true;
}

/** How the cropper renders a staged source: the animated original, or the still preview. */
export type StageMediaKind = 'video' | 'gif' | 'image';

export interface StagePreview { src: string; kind: 'video' | 'image' }

/**
 * A video plays in the cropper's <video>; a gif animates in its <img>; a still
 * (or an unknown kind, from a service that predates the field) uses the jpeg
 * preview the stage step extracted.
 */
export function stagePreviewFor(kind: string | null | undefined, rawUrl: string, previewUrl: string): StagePreview {
  if (kind === 'video') return { src: rawUrl, kind: 'video' };
  if (kind === 'gif') return { src: rawUrl, kind: 'image' };
  return { src: previewUrl, kind: 'image' };
}

export async function stageMedia(file: File): Promise<{ stageId: string; mediaKind?: StageMediaKind; error: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('file', file);
  return postServiceForm<{ stageId: string; error: boolean; msg: string }>('/media/stage', form);
}

export function mediaStageRawUrl(stageId: string): string {
  const base = resolveHttp(`/media/stage/${encodeURIComponent(stageId)}/raw`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export function mediaStagePreviewUrl(stageId: string): string {
  const base = resolveHttp(`/media/stage/${encodeURIComponent(stageId)}/preview`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export async function commitMedia(stageId: string, crop: string, name: string): Promise<{ item: MediaItem | null; error: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('stageId', stageId);
  form.append('crop', crop);
  form.append('name', name);
  return postServiceForm<{ item: MediaItem | null; error: boolean; msg: string }>('/media/commit', form);
}

export async function cancelMediaStage(stageId: string): Promise<void> {
  await deleteService<{ error?: boolean }>(`/media/stage/${encodeURIComponent(stageId)}`);
}
