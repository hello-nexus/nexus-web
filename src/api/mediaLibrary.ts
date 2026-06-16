import { deleteService, fetchService, postService, postServiceForm } from './service';

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

export async function importMedia(file: File, crop?: string | null): Promise<{ item: MediaItem | null; error: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('file', file);
  if (crop) form.append('crop', crop);
  return postServiceForm<{ item: MediaItem | null; error: boolean; msg: string }>('/media/import', form);
}

export async function openMediaFolder(): Promise<boolean> {
  const resp = await postService<{ error?: boolean }>('/media/library/open', {});
  return !!resp && resp.error !== true;
}
