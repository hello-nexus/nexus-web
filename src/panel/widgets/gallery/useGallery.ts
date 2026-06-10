import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { fetchGalleryItems, galleryItemFileUrl, type GalleryItem } from '../../../api/gallery';
import { fetchServiceBlob } from '../../../api/service';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { usePanelPreview } from '../common/PanelPreviewContext';

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
    // A null response is an outage, not an empty gallery — stay unloaded so
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

/**
 * Blob loader for full-resolution gallery images. Panel auth is token-based,
 * so <img> can't hit the route directly; images load via fetchServiceBlob →
 * object URL. The cache is intentionally tiny (the viewer retains only
 * prev/current/next) — full-resolution photos are heavy on the Y70/phone
 * WebView, so everything outside the retain set is revoked eagerly.
 */
export function useGalleryImageLoader(): {
  getUrl: (id: string) => string | null;
  load: (id: string) => Promise<string | null>;
  retain: (ids: string[]) => void;
} {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const disposedRef = useRef(false);
  const [, bump] = useReducer((c: number) => c + 1, 0);

  const load = useCallback((id: string): Promise<string | null> => {
    const cached = cacheRef.current.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = pendingRef.current.get(id);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const blob = await fetchServiceBlob(galleryItemFileUrl(id));
        // A fetch resolving after unmount must not mint an object URL the
        // cleanup already missed — that's a leaked full-res blob per remount.
        if (!blob || disposedRef.current) return null;
        const existing = cacheRef.current.get(id);
        if (existing) return existing;
        const url = URL.createObjectURL(blob);
        cacheRef.current.set(id, url);
        bump();
        return url;
      } catch {
        // Connection drop mid-body rejects .blob(); a cached rejection would
        // otherwise poison this id until remount.
        return null;
      } finally {
        pendingRef.current.delete(id);
      }
    })();
    pendingRef.current.set(id, promise);
    return promise;
  }, []);

  const retain = useCallback((ids: string[]) => {
    const keep = new Set(ids);
    for (const [id, url] of cacheRef.current) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(url);
        cacheRef.current.delete(id);
      }
    }
  }, []);

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

  const getUrl = useCallback((id: string) => cacheRef.current.get(id) ?? null, []);

  return { getUrl, load, retain };
}
