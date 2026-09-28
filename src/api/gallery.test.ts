import { describe, expect, it } from 'vitest';
import {
  GALLERY_WIDTHS,
  galleryItemFileUrl,
  galleryPlaylistItems,
  isGalleryPlaylistMember,
  snapGalleryWidth,
  toggleGalleryPlaylistItem,
  toggleGalleryPlaylistSource,
  type GalleryItem,
  type GalleryPlaylist,
} from './gallery';

describe('gallery derivative widths', () => {
  it('rounds a rendered width up onto a bucket', () => {
    expect(snapGalleryWidth(1)).toBe(320);
    expect(snapGalleryWidth(320)).toBe(320);
    expect(snapGalleryWidth(321)).toBe(480);
    expect(snapGalleryWidth(700)).toBe(960);
  });

  it('clamps above the largest bucket instead of asking for a bespoke width', () => {
    const largest = GALLERY_WIDTHS[GALLERY_WIDTHS.length - 1];
    expect(snapGalleryWidth(largest)).toBe(largest);
    expect(snapGalleryWidth(largest * 3)).toBe(largest);
  });

  it('only asks for a derivative when a width is given', () => {
    expect(galleryItemFileUrl('abc')).toBe('/gallery/items/abc/file');
    expect(galleryItemFileUrl('abc', 640)).toBe('/gallery/items/abc/file?w=640');
  });

  it('escapes the item id', () => {
    expect(galleryItemFileUrl('a b/c', 320)).toBe('/gallery/items/a%20b%2Fc/file?w=320');
  });
});

describe('gallery playlists', () => {
  const item = (id: string, sourceId: string): GalleryItem => ({ id, name: `${id}.png`, sourceId, kind: 'image' });
  const library = [item('a1', 'A'), item('a2', 'A'), item('b1', 'B'), item('b2', 'B')];
  const playlist = (patch: Partial<GalleryPlaylist> = {}): GalleryPlaylist => ({
    id: 'pl', name: 'Desk', createdAtUnixMs: 1, sourceIds: [], itemIds: [], excludedIds: [], ...patch,
  });
  const ids = (items: GalleryItem[]) => items.map(i => i.id);

  it('a whole source brings every item it has, minus the exclusions, in library order', () => {
    const p = playlist({ sourceIds: ['A'], excludedIds: ['a1'], itemIds: ['b2'] });
    expect(ids(galleryPlaylistItems(library, p))).toEqual(['a2', 'b2']);
    // A folder's file that appears later joins with no edit to the playlist.
    expect(ids(galleryPlaylistItems([...library, item('a3', 'A')], p))).toEqual(['a2', 'b2', 'a3']);
  });

  it('a picked id outside the library plays nothing', () => {
    expect(galleryPlaylistItems(library, playlist({ itemIds: ['gone'] }))).toEqual([]);
  });

  it('toggles an item of a whole source through the exclusions, keeping the source', () => {
    const p = toggleGalleryPlaylistItem(playlist({ sourceIds: ['A'] }), library[0]);
    expect(p.sourceIds).toEqual(['A']);
    expect(p.excludedIds).toEqual(['a1']);
    expect(isGalleryPlaylistMember(p, library[0])).toBe(false);
    expect(isGalleryPlaylistMember(toggleGalleryPlaylistItem(p, library[0]), library[0])).toBe(true);
  });

  it('toggles any other item as a single pick', () => {
    const p = toggleGalleryPlaylistItem(playlist(), library[2]);
    expect(p.itemIds).toEqual(['b1']);
    expect(toggleGalleryPlaylistItem(p, library[2]).itemIds).toEqual([]);
  });

  it('switching a source whole in or out clears its picks and exclusions only', () => {
    const on = toggleGalleryPlaylistSource(playlist({ itemIds: ['a1', 'b1'], excludedIds: ['a2'] }), 'A', library);
    expect(on).toMatchObject({ sourceIds: ['A'], itemIds: ['b1'], excludedIds: [] });

    const off = toggleGalleryPlaylistSource(playlist({ sourceIds: ['A'], excludedIds: ['a1'], itemIds: ['b1'] }), 'A', library);
    expect(off).toMatchObject({ sourceIds: [], itemIds: ['b1'], excludedIds: [] });
    expect(ids(galleryPlaylistItems(library, off))).toEqual(['b1']);
  });
});
