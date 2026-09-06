import { describe, expect, it } from 'vitest';
import {
  GALLERY_WIDTHS,
  galleryItemFileUrl,
  snapGalleryWidth,
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
