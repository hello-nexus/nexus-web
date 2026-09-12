import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  GALLERY_DEFAULT_WIDTH,
  fetchGalleryItems,
  galleryItemFileUrl,
  snapGalleryWidth,
  type GalleryItem,
} from '../../../api/gallery';
import { fetchServiceBlob } from '../../../api/service';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { PanelWidget } from '../../types';

// Per-instance choice of what the widget draws from the shared library. The
// library itself is one set for every surface; this only narrows the view.
export type GalleryMediaFilter = 'both' | 'images' | 'videos';

export function readGalleryMediaFilter(config: PanelWidget['config']): GalleryMediaFilter {
  const v = config?.media;
  return v === 'images' || v === 'videos' ? v : 'both';
}

export function filterGalleryItems(items: GalleryItem[], filter: GalleryMediaFilter): GalleryItem[] {
  if (filter === 'both') return items;
  const kind = filter === 'videos' ? 'video' : 'image';
  return items.filter(i => i.kind === kind);
}

// Per-widget-instance viewer position, shared between the tile and its
// immersive view (separate component instances in the same document) so
// fullscreen opens on the photo the tile is showing, and a remounted tile
// resumes where it left off. Keyed by item id, not index - the list can
// change between reads.
const lastShownItem = new Map<string, string>();

export function rememberGalleryPosition(widgetId: string, itemId: string): void {
  lastShownItem.set(widgetId, itemId);
}

export function recallGalleryPosition(widgetId: string): string | undefined {
  return lastShownItem.get(widgetId);
}

/**
 * Shared per-system gallery item list. Fetches once on mount and refetches on
 * the 'gallery' multiplex topic (source added/removed, upload). Preview mode
 * (widget catalog) never touches the network.
 */
export function useGalleryItems(): { items: GalleryItem[]; loaded: boolean; refresh: () => Promise<void> } {
  const preview = usePanelPreview();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetchGalleryItems();
    // A null response is an outage, not an empty gallery - stay unloaded so
    // the widget doesn't flash the "no images" state over a populated set.
    if (!res?.items) return;
    setItems(res.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (preview) return;
    // refresh()'s setState runs after the HTTP fetch resolves, not
    // synchronously in the effect body.

    refresh();
  }, [preview, refresh]);
  useTopicCallback('gallery', !preview, refresh);

  return { items, loaded, refresh };
}

// Blobs are per (image, width): the same photo at two viewer sizes is two
// different downloads, and a resize must not serve the stale one.
const cacheKey = (id: string, width: number) => `${id}@${width}`;

const MAX_PIXEL_RATIO = 2;

/**
 * Snapped derivative width for a viewer box, tracked across resizes.
 *
 * Measured with getBoundingClientRect, NOT clientWidth: panel surfaces render
 * their content at a reduced layout size and scale it up with the
 * `--panel-scale` transform, so clientWidth is the pre-transform box and
 * under-reports the pixels actually painted - on a panel it would pick a
 * bucket several rungs too small, which is the whole quantity this feature
 * turns on. (The opposite of the layout-math case useGameBoardScale
 * documents, where the untransformed box is the one you want.) A box
 * measuring 0 (not laid out yet, jsdom) keeps the default bucket rather than
 * blocking the load on a measurement that may never arrive.
 */
export function useGalleryRenderWidth(): { boxRef: (el: HTMLElement | null) => void; width: number } {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(GALLERY_DEFAULT_WIDTH);

  useLayoutEffect(() => {
    if (!box) return undefined;
    const update = () => {
      const painted = box.getBoundingClientRect().width;
      if (painted <= 0) return;
      // Capped: a very high-density screen would otherwise pull the top bucket
      // for a small tile, spending bytes on detail the panel cannot resolve.
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      setWidth(snapGalleryWidth(Math.ceil(painted * dpr)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  return { boxRef: setBox, width };
}

/**
 * Blob loader for gallery stills at one rendered width - the downsized image,
 * or for a video its poster frame. Panel auth is token-based, so <img> can't
 * hit the route directly; stills load via fetchServiceBlob → object URL. The
 * clip itself never comes through here (see galleryItemVideoUrl).
 *
 * Entries are keyed by id AND width, so a resize retains nothing at the old
 * width and those blobs are revoked on the next pass. The cache stays small on
 * purpose - the service falls back to the untouched original for formats it
 * cannot derive (animated/alpha), and those are heavy on the Y70/phone WebView.
 */
export function useGalleryImageLoader(width: number): {
  getUrl: (id: string) => string | null;
  load: (id: string) => Promise<string | null>;
  retain: (ids: string[]) => void;
} {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const disposedRef = useRef(false);
  // The width a resolving fetch has to still match. A resize sweeps the old
  // width out of the cache, and a fetch that started before it must not insert
  // afterwards - that blob is unreachable by getUrl and would sit there until
  // the next retain pass, which on a single-image widget never comes.
  const widthRef = useRef(width);
  widthRef.current = width;
  const [, bump] = useReducer((c: number) => c + 1, 0);

  const load = useCallback((id: string): Promise<string | null> => {
    const key = cacheKey(id, width);
    const cached = cacheRef.current.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = pendingRef.current.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const blob = await fetchServiceBlob(galleryItemFileUrl(id, width));
        // A fetch resolving after unmount - or after a resize moved the
        // cache to another width - must not mint an object URL that nothing
        // will ever revoke.
        if (!blob || disposedRef.current || widthRef.current !== width) return null;
        const existing = cacheRef.current.get(key);
        if (existing) return existing;
        const url = URL.createObjectURL(blob);
        cacheRef.current.set(key, url);
        bump();
        return url;
      } catch {
        // Connection drop mid-body rejects .blob(); a cached rejection would
        // otherwise poison this id until remount.
        return null;
      } finally {
        pendingRef.current.delete(key);
      }
    })();
    pendingRef.current.set(key, promise);
    return promise;
  }, [width]);

  const retain = useCallback((ids: string[]) => {
    const keep = new Set(ids);
    // An off-width copy of a retained image is held until its current-width
    // replacement has landed - that copy is what getUrl paints so a resize
    // does not blank the viewer. Everything outside the window goes at once.
    const replaced = new Set(ids.filter(id => cacheRef.current.has(cacheKey(id, width))));
    for (const [key, url] of cacheRef.current) {
      const id = key.slice(0, key.lastIndexOf('@'));
      const stale = key !== cacheKey(id, width) && replaced.has(id);
      if (!keep.has(id) || stale) {
        URL.revokeObjectURL(url);
        cacheRef.current.delete(key);
      }
    }
  }, [width]);

  useEffect(() => {
    // Re-arm on setup: StrictMode's dev double-invoke runs this cleanup once
    // before the real mount, and a stuck-true flag would null every load.
    disposedRef.current = false;
    const cache = cacheRef.current;
    return () => {
      disposedRef.current = true;
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  // Falls back to this image at any other width so a bucket-crossing resize
  // keeps painting the size it already has while the new one loads, instead of
  // blanking the viewer.
  const getUrl = useCallback((id: string) => {
    const exact = cacheRef.current.get(cacheKey(id, width));
    if (exact) return exact;
    const prefix = `${id}@`;
    for (const [key, url] of cacheRef.current) {
      if (key.startsWith(prefix)) return url;
    }
    return null;
  }, [width]);

  return { getUrl, load, retain };
}
