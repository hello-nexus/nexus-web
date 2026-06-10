import { deleteService, fetchService, postService } from './service';

// Per-system shared gallery: every panel surface of one PC reads the same
// source set, and sources are pure path references — Nexus never stores or
// deletes image bytes. Item/file reads are panel-accessible; source
// management and the native picker are desktop-tier only.

export type GallerySourceKind = 'file' | 'folder';

export interface GallerySource {
  id: string;
  kind: GallerySourceKind;
  path: string;
  name: string;
  addedAtUnixMs: number;
  // Item ids of a folder source the user removed from the gallery; the files
  // stay on disk and one restore call brings them all back.
  excluded: string[];
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

// Stable error code on source mutations. Keep in lockstep with
// GalleryErrorCodes in nexus-service Models/Gallery/GalleryModels.cs.
export const GALLERY_ERROR_DUPLICATE = 'duplicate';

export interface GallerySourceMutation {
  source: GallerySource | null;
  error?: boolean;
  msg?: string;
  code?: string;
}

export const fetchGallerySources = () =>
  fetchService<{ sources: GallerySource[] }>('/gallery/sources');

export const fetchGalleryItems = () =>
  fetchService<{ items: GalleryItem[] }>('/gallery/items');

// 'auto' lets the service stat the path (drag-n-drop sends bare paths).
export const addGallerySource = (path: string, kind: 'file' | 'folder' | 'auto') =>
  postService<GallerySourceMutation>('/gallery/sources', { path, kind });

export async function deleteGallerySource(id: string): Promise<boolean> {
  const resp = await deleteService<GallerySourceMutation>(`/gallery/sources/${encodeURIComponent(id)}`);
  return !!resp && resp.error !== true;
}

export async function excludeGalleryItem(sourceId: string, itemId: string): Promise<boolean> {
  const resp = await postService<GallerySourceMutation>(
    `/gallery/sources/${encodeURIComponent(sourceId)}/exclude`, { itemId });
  return !!resp && resp.error !== true;
}

export async function restoreGalleryExclusions(sourceId: string): Promise<boolean> {
  const resp = await postService<GallerySourceMutation>(
    `/gallery/sources/${encodeURIComponent(sourceId)}/restore`, {});
  return !!resp && resp.error !== true;
}

// Opens the native OS file/folder dialog on the host PC and resolves with the
// chosen absolute paths once the user closes it — this request stays in
// flight for as long as the dialog is open.
export const pickGalleryPaths = (folder: boolean) =>
  postService<GalleryPickResponse>('/gallery/pick', { folder });

export function galleryItemFileUrl(id: string): string {
  return `/gallery/items/${encodeURIComponent(id)}/file`;
}
