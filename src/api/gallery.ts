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

export interface GalleryBrowseEntry {
  name: string;
  path: string;
}

export interface GalleryBrowseResponse {
  path: string;
  parent?: string | null;
  dirs: GalleryBrowseEntry[];
  files: GalleryBrowseEntry[];
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

export const browseGallery = (path?: string) =>
  fetchService<GalleryBrowseResponse>(`/gallery/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`);

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
