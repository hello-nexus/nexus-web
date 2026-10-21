export const GALLERY_PAGE_SIZE = 100;

export function galleryPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / GALLERY_PAGE_SIZE));
}

export function clampGalleryPage(page: number, total: number): number {
  return Math.min(Math.max(0, page), galleryPageCount(total) - 1);
}

export function galleryPageSlice<T>(items: T[], page: number): T[] {
  const start = clampGalleryPage(page, items.length) * GALLERY_PAGE_SIZE;
  return items.slice(start, start + GALLERY_PAGE_SIZE);
}

/** Ids whose thumbnails stay cached: the current page and its neighbours. */
export function galleryKeepIds<T extends { id: string }>(items: T[], page: number): Set<string> {
  const p = clampGalleryPage(page, items.length);
  const from = Math.max(0, p - 1) * GALLERY_PAGE_SIZE;
  const to = (p + 2) * GALLERY_PAGE_SIZE;
  return new Set(items.slice(from, to).map(i => i.id));
}
