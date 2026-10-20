import { useEffect, useState } from 'react';
import { fetchDeckImage } from '../../../api/deckImages';
import { withMediaFetchSlot as withImageSlot } from '../../../lib/mediaFetchSlot';

interface DeckImageState {
  url: string | null;
  isVideo: boolean;
}

interface CacheEntry {
  refs: number;
  state: DeckImageState | null;
  listeners: Set<() => void>;
}

const NONE: DeckImageState = { url: null, isVideo: false };

// One fetch and one object URL per id, shared by every key and the picker preview; freed when the last user unmounts.
const cache = new Map<string, CacheEntry>();

function acquire(id: string): CacheEntry {
  const existing = cache.get(id);
  if (existing) { existing.refs++; return existing; }
  const entry: CacheEntry = { refs: 1, state: null, listeners: new Set() };
  cache.set(id, entry);
  void withImageSlot(async () => {
    if (cache.get(id) !== entry) return;
    const blob = await fetchDeckImage(id);
    if (cache.get(id) !== entry || !blob || blob.size === 0) return;
    entry.state = { url: URL.createObjectURL(blob), isVideo: blob.type.startsWith('video/') };
    entry.listeners.forEach(fn => fn());
  });
  return entry;
}

function release(id: string, entry: CacheEntry) {
  if (--entry.refs > 0) return;
  if (cache.get(id) === entry) cache.delete(id);
  if (entry.state?.url) URL.revokeObjectURL(entry.state.url);
}

/** A deck key's custom image as an object URL (null while loading, absent or failed) plus whether the blob is a video. */
export function useDeckImage(id: string | undefined): DeckImageState {
  const [state, setState] = useState<DeckImageState>(NONE);

  useEffect(() => {
    if (!id) { setState(NONE); return; }
    const entry = acquire(id);
    const sync = () => setState(entry.state ?? NONE);
    entry.listeners.add(sync);
    sync();
    return () => {
      entry.listeners.delete(sync);
      release(id, entry);
    };
  }, [id]);

  return state;
}
