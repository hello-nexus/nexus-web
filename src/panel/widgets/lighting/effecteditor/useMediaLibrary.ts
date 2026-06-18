import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMediaCurrent,
  fetchMediaLibrary,
  playMedia,
  type MediaItem,
} from '../../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../../api/service';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { usePanelPreview } from '../../common/PanelPreviewContext';

/**
 * Owns the media library list + active-item + lazily loaded thumbnails. Shared
 * by the desktop MediaControls (which adds import/delete chrome) and the
 * immersive read-only MediaList, so the fetch + thumbnail lifecycle lives in
 * exactly one place.
 */
export function useMediaLibrary() {
  const preview = usePanelPreview();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [lib, cur] = await Promise.all([
      fetchMediaLibrary(),
      fetchMediaCurrent(),
    ]);
    if (lib?.items) setItems(lib.items);
    if (cur?.mediaId) setActiveId(cur.mediaId);
  }, []);

  // Initial load: pull library + currently playing media on mount.
  // refresh()'s setState runs after its Promise resolves.
  useEffect(() => { if (!preview) refresh(); }, [preview, refresh]);
  useTopicCallback('mediaLibrary', !preview, refresh);

  useEffect(() => {
    thumbsRef.current = thumbs;
  }, [thumbs]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) {
      URL.revokeObjectURL(url);
    }
    thumbsRef.current = {};
  }, []);

  // Prune thumbnails whose item disappeared from the library.
  useEffect(() => {
    const itemIds = new Set(items.map(item => item.id));
    setThumbs(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [id, url] of Object.entries(prev)) {
        if (!itemIds.has(id)) {
          URL.revokeObjectURL(url);
          delete next[id];
          changed = true;
        }
      }
      if (changed) thumbsRef.current = next;
      return changed ? next : prev;
    });
  }, [items]);

  // Lazily fetch each item's thumbnail blob once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (thumbsRef.current[item.id]) continue;
        const blob = await fetchServiceBlob(`/media/${encodeURIComponent(item.id)}/thumbnail`);
        if (cancelled) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          setThumbs(prev => {
            if (prev[item.id]) {
              URL.revokeObjectURL(url);
              return prev;
            }
            const next = { ...prev, [item.id]: url };
            thumbsRef.current = next;
            return next;
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const play = useCallback(async (id: string) => {
    if (id === activeId) return;
    const ok = await playMedia(id);
    if (ok) setActiveId(id);
  }, [activeId]);

  // Optimistic local removal after a confirmed delete; the caller still
  // round-trips a refresh() afterwards to reconcile with the service.
  const removeLocal = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    setThumbs(prev => {
      const url = prev[id];
      if (url) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[id];
      thumbsRef.current = next;
      return next;
    });
    setActiveId(prev => (prev === id ? null : prev));
  }, []);

  return { items, activeId, setActiveId, thumbs, refresh, play, removeLocal };
}
