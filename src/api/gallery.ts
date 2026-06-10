import { deleteService, fetchService, postService, postServiceForm } from './service';

// Per-system shared gallery: every panel surface of one PC reads the same
// source set. Item/file/thumbnail reads are panel-accessible; source
// management and filesystem browsing are desktop-tier only.

export type GallerySourceKind = 'file' | 'folder' | 'upload';

export interface GallerySource {
  id: string;
  kind: GallerySourceKind;
  path: string;
  name: string;
  addedAtUnixMs: number;
}

export interface GalleryItem {
  id: string;
  name: string;
  sourceId: string;
}

export interface GalleryPickResponse {
  paths: string[];
  cancelled?: boolean;
  error?: boolean;
  msg?: string;
}

export interface GallerySourceMutation {
  source: GallerySource | null;
  error?: boolean;
  msg?: string;
}

export const fetchGallerySources = () =>
  fetchService<{ sources: GallerySource[] }>('/gallery/sources');

export const fetchGalleryItems = () =>
  fetchService<{ items: GalleryItem[] }>('/gallery/items');

export const addGallerySource = (path: string, kind: 'file' | 'folder') =>
  postService<GallerySourceMutation>('/gallery/sources', { path, kind });

export async function deleteGallerySource(id: string): Promise<boolean> {
  const resp = await deleteService<GallerySourceMutation>(`/gallery/sources/${encodeURIComponent(id)}`);
  return !!resp && resp.error !== true;
}

// Opens the native OS file/folder dialog on the host PC and resolves with the
// chosen absolute paths once the user closes it — this request stays in
// flight for as long as the dialog is open.
export const pickGalleryPaths = (folder: boolean) =>
  postService<GalleryPickResponse>('/gallery/pick', { folder });

export function importGalleryImage(file: File): Promise<GallerySourceMutation | null> {
  const form = new FormData();
  form.append('file', file);
  return postServiceForm<GallerySourceMutation>('/gallery/import', form);
}

export function galleryItemFileUrl(id: string): string {
  return `/gallery/items/${encodeURIComponent(id)}/file`;
}

export function galleryItemThumbUrl(id: string): string {
  return `/gallery/items/${encodeURIComponent(id)}/thumbnail`;
}
