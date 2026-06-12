import { useEffect, useState } from 'react';
import { fetchServiceBlob } from '../api/service';
import { effectThumbnailPath } from '../api/lighting';

// Presets are universal, so a thumbnail is fully identified by (effect, slot)
// plus a content hash of that slot's saved look. This module-level cache holds
// one object URL per (effect, slot), refreshed when the hash changes — so every
// surface (lighting page, panels, preset buttons, widget tile) shares the same
// fetched blob, and a committed edit refetches exactly the slots that changed.
const cache = new Map<string, { version: string; url: string }>();
const pending = new Map<string, Promise<string | null>>();

function load(effect: string, slot: number, version: string): Promise<string | null> {
  const key = `${effect}:${slot}`;
  const have = cache.get(key);
  if (have && have.version === version) return Promise.resolve(have.url);
  const pkey = `${key}@${version}`;
  let p = pending.get(pkey);
  if (!p) {
    p = (async () => {
      const blob = await fetchServiceBlob(effectThumbnailPath(effect, slot, version));
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

/** Resolve a preset slot's thumbnail blob URL (null while loading). */
export function useEffectThumbnail(effect: string, slot: number, version: string): string | null {
  const cached = cache.get(`${effect}:${slot}`);
  const [url, setUrl] = useState<string | null>(
    cached && cached.version === version ? cached.url : null,
  );
  useEffect(() => {
    let cancelled = false;
    const c = cache.get(`${effect}:${slot}`);
    if (c && c.version === version) {
      setUrl(c.url);
      return;
    }
    setUrl(null);
    load(effect, slot, version).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [effect, slot, version]);
  return url;
}
