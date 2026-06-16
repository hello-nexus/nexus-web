import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBackgroundMediaLibrary, backgroundMediaThumbnailPath, type BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { fetchServiceBlob } from '../../api/service';

export function useBackgroundMedia(deviceId: string) {
  const [items, setItems] = useState<BackgroundMediaItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const lib = await fetchBackgroundMediaLibrary(deviceId);
    if (lib?.items) setItems(lib.items);
  }, [deviceId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    thumbsRef.current = thumbs;
  }, [thumbs]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) {
      URL.revokeObjectURL(url);
    }
    thumbsRef.current = {};
  }, []);

  // Prune thumbnails whose item disappeared.
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

  // Lazily fetch thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (thumbsRef.current[item.id]) continue;
        const blob = await fetchServiceBlob(backgroundMediaThumbnailPath(deviceId, item.id));
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
  }, [items, deviceId]);

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
  }, []);

  return { items, thumbs, refresh, removeLocal };
}
