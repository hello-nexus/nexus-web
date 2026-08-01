import { useEffect, useState } from 'react';
import { fetchServiceBlob } from '../api/service';
import { effectThumbnailPath } from '../api/lighting';

// Presets are universal, so a thumbnail is fully identified by (effect, slot)
// plus a content hash of that slot's saved look. This module-level cache holds
// one object URL per (effect, slot), refreshed when the hash changes - so every
// surface (lighting page, panels, preset buttons, widget tile) shares the same
// fetched blob, and a committed edit refetches exactly the slots that changed.
const cache = new Map<string, { version: string; url: string }>();

// Static mode renders the same effect at speed 0, which is a different image
// than the animate tile, so the two must not share a cache entry.
const cacheKey = (effect: string, slot: number, frozen: boolean) =>
  `${effect}:${slot}${frozen ? ':f' : ''}`;
const pending = new Map<string, Promise<string | null>>();

function load(effect: string, slot: number, version: string, frozen: boolean): Promise<string | null> {
  const key = cacheKey(effect, slot, frozen);
  const have = cache.get(key);
  if (have && have.version === version) return Promise.resolve(have.url);
  const pkey = `${key}@${version}`;
  let p = pending.get(pkey);
  if (!p) {
    p = (async () => {
      const blob = await fetchServiceBlob(effectThumbnailPath(effect, slot, version, frozen));
      if (!blob) return cache.get(key)?.url ?? null;
      const prev = cache.get(key);
      if (prev && prev.version === version) return prev.url;
      const url = URL.createObjectURL(blob);
      if (prev) URL.revokeObjectURL(prev.url);
      cache.set(key, { version, url });
      return url;
    })();
    pending.set(pkey, p);
    void p.finally(() => pending.delete(pkey));
  }
  return p;
}

/**
 * Resolve a preset slot's thumbnail blob URL (null while loading or skipped).
 * Pass skip=true to suppress the fetch when thumbnails cannot be generated
 * (e.g. GPU unavailable on the host).
 */
export function useEffectThumbnail(effect: string, slot: number, version: string, skip?: boolean, frozen = false): string | null {
  const cached = skip ? null : cache.get(cacheKey(effect, slot, frozen));
  const [url, setUrl] = useState<string | null>(
    !skip && cached && cached.version === version ? cached.url : null,
  );
  useEffect(() => {
    if (skip) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    const c = cache.get(cacheKey(effect, slot, frozen));
    if (c && c.version === version) {
      setUrl(c.url);
      return;
    }
    setUrl(null);
    load(effect, slot, version, frozen).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [effect, slot, version, skip, frozen]);
  return url;
}
