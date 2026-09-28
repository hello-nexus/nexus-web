import { deleteService, fetchService, postService, putService, resolveHttp, tokenParam } from './service';

// Per-system shared gallery: every panel surface of one PC reads the same
// source set, and sources are pure path references - Nexus never stores or
// deletes media bytes. Item/file reads are panel-accessible; source
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

// Decided by the service from the file extension. A video is only ever a
// browser-native container (mp4/m4v/webm/mov): nothing transcodes, so the
// panel's own <video> plays the referenced file as-is.
export type GalleryItemKind = 'image' | 'video';

export interface GalleryItem {
  id: string;
  name: string;
  sourceId: string;
  kind: GalleryItemKind;
}

// A named cut of the library one widget instance plays instead of all of it.
// Membership is resolved live (galleryPlaylistItems): a whole-included source
// keeps picking up the folder's new files.
export interface GalleryPlaylist {
  id: string;
  name: string;
  createdAtUnixMs: number;
  // Sources included whole.
  sourceIds: string[];
  // Items picked one by one, from sources not included whole.
  itemIds: string[];
  // Items of a whole-included source left out of this playlist.
  excludedIds: string[];
}

// Keep in lockstep with GalleryLibrary.MaxPlaylistNameLength / MaxPlaylists
// in nexus-service Gallery/GalleryLibrary.cs.
export const GALLERY_PLAYLIST_NAME_MAX = 48;
export const GALLERY_PLAYLISTS_MAX = 50;

export function isGalleryPlaylistMember(playlist: GalleryPlaylist, item: GalleryItem): boolean {
  if (playlist.sourceIds.includes(item.sourceId)) return !playlist.excludedIds.includes(item.id);
  return playlist.itemIds.includes(item.id);
}

/** The playlist's items, in library order. */
export function galleryPlaylistItems(items: GalleryItem[], playlist: GalleryPlaylist): GalleryItem[] {
  const sources = new Set(playlist.sourceIds);
  const picked = new Set(playlist.itemIds);
  const excluded = new Set(playlist.excludedIds);
  return items.filter(i => (sources.has(i.sourceId) ? !excluded.has(i.id) : picked.has(i.id)));
}

/**
 * The playlist with one item switched in or out. An item of a whole-included
 * source toggles on the playlist's exclusions, so the folder keeps following
 * its new files; any other item toggles as a single pick.
 */
export function toggleGalleryPlaylistItem(playlist: GalleryPlaylist, item: GalleryItem): GalleryPlaylist {
  const flip = (ids: string[]) => (ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]);
  return playlist.sourceIds.includes(item.sourceId)
    ? { ...playlist, excludedIds: flip(playlist.excludedIds) }
    : { ...playlist, itemIds: flip(playlist.itemIds) };
}

/**
 * The playlist with a whole source switched in or out. Either way the
 * source's single picks and exclusions are cleared: including it covers the
 * picks, and dropping it has to leave none of its items behind.
 */
export function toggleGalleryPlaylistSource(playlist: GalleryPlaylist, sourceId: string, items: GalleryItem[]): GalleryPlaylist {
  const ofSource = new Set(items.filter(i => i.sourceId === sourceId).map(i => i.id));
  const included = playlist.sourceIds.includes(sourceId);
  return {
    ...playlist,
    sourceIds: included ? playlist.sourceIds.filter(id => id !== sourceId) : [...playlist.sourceIds, sourceId],
    itemIds: playlist.itemIds.filter(id => !ofSource.has(id)),
    excludedIds: playlist.excludedIds.filter(id => !ofSource.has(id)),
  };
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
export const GALLERY_ERROR_LIMIT = 'limit';

export interface GallerySourceMutation {
  source: GallerySource | null;
  error?: boolean;
  msg?: string;
  code?: string;
}

export const fetchGallerySources = () =>
  fetchService<{ sources: GallerySource[] }>('/gallery/sources');

// Playlists ride on the items read so every surface (a relayed phone too)
// resolves a widget's playlist without a second request.
export const fetchGalleryItems = () =>
  fetchService<{ items: GalleryItem[]; playlists?: GalleryPlaylist[] }>('/gallery/items');

export interface GalleryPlaylistMutation {
  playlist: GalleryPlaylist | null;
  error?: boolean;
  msg?: string;
  code?: string;
}

// A 404 carries no body; reading it as JSON throws, and callers only need to
// know the change did not land.
async function playlistMutation(run: () => Promise<GalleryPlaylistMutation | null>): Promise<GalleryPlaylistMutation | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export const createGalleryPlaylist = (name: string) =>
  playlistMutation(() => postService<GalleryPlaylistMutation>('/gallery/playlists', { name }));

export const updateGalleryPlaylist = (
  id: string,
  patch: Partial<Pick<GalleryPlaylist, 'name' | 'sourceIds' | 'itemIds' | 'excludedIds'>>,
) => playlistMutation(() => putService<GalleryPlaylistMutation>(`/gallery/playlists/${encodeURIComponent(id)}`, patch));

// Gallery widgets that play a playlist, per surface. Keep the surface values
// in lockstep with GalleryPlaylistUseSurfaces in nexus-service
// Models/Gallery/GalleryModels.cs.
export interface GalleryPlaylistUse {
  surface: 'dashboard' | 'panel' | 'desktop';
  // The panel device's name; empty for the dashboard and desktop widgets.
  name: string;
  count: number;
}

/** Null when the lookup failed, which callers treat as "unknown", not "unused". */
export async function fetchGalleryPlaylistUsage(id: string): Promise<GalleryPlaylistUse[] | null> {
  try {
    const res = await fetchService<{ uses: GalleryPlaylistUse[] }>(`/gallery/playlists/${encodeURIComponent(id)}/usage`);
    return res?.uses ?? null;
  } catch {
    return null;
  }
}

export async function deleteGalleryPlaylist(id: string): Promise<boolean> {
  const resp = await playlistMutation(() => deleteService<GalleryPlaylistMutation>(`/gallery/playlists/${encodeURIComponent(id)}`));
  return !!resp && resp.error !== true;
}

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
// chosen absolute paths once the user closes it - this request stays in
// flight for as long as the dialog is open.
export const pickGalleryPaths = (folder: boolean) =>
  postService<GalleryPickResponse>('/gallery/pick', { folder });

// Derivative widths the service will encode, ascending. Keep in lockstep with
// GalleryResizeCache.Buckets in nexus-service Gallery/GalleryResizeCache.cs.
// An off-list width is snapped up server-side, so drift here costs a wasted
// cache entry rather than a wrong image.
export const GALLERY_WIDTHS = [320, 480, 640, 960, 1280, 1920];

// Nominal CSS width of a grid cell. The grid is auto-fill/minmax, so cells
// vary; this is the upper end, snapped and DPR-scaled by galleryThumbWidth.
const GALLERY_THUMB_CSS_WIDTH = 280;

/** Derivative width for a gallery grid thumbnail on this display. */
export function galleryThumbWidth(): number {
  const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);
  return snapGalleryWidth(Math.ceil(GALLERY_THUMB_CSS_WIDTH * dpr));
}

// Used when a viewer has not been measured yet (no layout, jsdom). Loading a
// mid-sized derivative beats blocking on a measurement that may never arrive.
export const GALLERY_DEFAULT_WIDTH = 640;

/** Rounds a rendered pixel width up onto the nearest service bucket. */
export function snapGalleryWidth(px: number): number {
  return GALLERY_WIDTHS.find(w => px <= w) ?? GALLERY_WIDTHS[GALLERY_WIDTHS.length - 1];
}

// `width` requests a panel-sized JPEG instead of the user's original file.
// For an image the service falls back to the original whenever it cannot
// derive one (animated/alpha formats, no ffmpeg), so callers never handle a
// resize error. For a video the JPEG is a first-frame poster, and there is no
// fallback: it 404s rather than hand the clip to an <img>.
export function galleryItemFileUrl(id: string, width?: number): string {
  const path = `/gallery/items/${encodeURIComponent(id)}/file`;
  return typeof width === 'number' && width > 0 ? `${path}?w=${width}` : path;
}

// Direct URL for a <video src>. Unlike images, a clip is not pulled through
// fetchServiceBlob: the element streams it with byte ranges, and a whole
// clip as one in-memory blob is exactly what the panel WebViews cannot hold.
// The session token rides as a query param, same as the panel background
// video, because an element load cannot send a Bearer header.
export function galleryItemVideoUrl(id: string): string {
  const base = resolveHttp(galleryItemFileUrl(id));
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}
