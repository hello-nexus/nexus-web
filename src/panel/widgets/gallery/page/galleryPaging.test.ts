import { describe, expect, it } from 'vitest';
import { clampGalleryPage, galleryKeepIds, galleryPageCount, galleryPageSlice, GALLERY_PAGE_SIZE } from './galleryPaging';

const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

describe('galleryPaging', () => {
  it('counts pages, at least one', () => {
    expect(galleryPageCount(0)).toBe(1);
    expect(galleryPageCount(GALLERY_PAGE_SIZE)).toBe(1);
    expect(galleryPageCount(GALLERY_PAGE_SIZE + 1)).toBe(2);
    expect(galleryPageCount(5000)).toBe(50);
  });

  it('clamps the page when the item count shrinks', () => {
    expect(clampGalleryPage(7, 250)).toBe(2);
    expect(clampGalleryPage(3, 0)).toBe(0);
    expect(clampGalleryPage(-1, 250)).toBe(0);
  });

  it('slices one page and a short last page', () => {
    const items = make(250);
    expect(galleryPageSlice(items, 1)[0].id).toBe('i100');
    expect(galleryPageSlice(items, 2)).toHaveLength(50);
    expect(galleryPageSlice(items, 9)[0].id).toBe('i200');
  });

  it('keeps the current page and its neighbours', () => {
    const keep = galleryKeepIds(make(500), 2);
    expect(keep.has('i100')).toBe(true);
    expect(keep.has('i399')).toBe(true);
    expect(keep.has('i99')).toBe(false);
    expect(keep.has('i400')).toBe(false);
  });
});
