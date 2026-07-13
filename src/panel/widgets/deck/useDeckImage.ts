import { useEffect, useState } from 'react';
import { fetchDeckImage } from '../../../api/deckImages';

// Cap concurrent image fetches for the same reason as AppPicker's icon gate
// (useAppIcon in ../common/AppPicker.tsx): a deck full of custom-image keys
// would otherwise burst one request each against the browser's per-origin
// connection pool and starve /ping + live traffic.
const DECK_IMAGE_FETCH_CONCURRENCY = 3;
let imagePermits = DECK_IMAGE_FETCH_CONCURRENCY;
const imageWaiters: Array<() => void> = [];

function withImageSlot<T>(run: () => Promise<T>): Promise<T> {
  const acquire = imagePermits > 0
    ? (imagePermits--, Promise.resolve())
    : new Promise<void>(resolve => imageWaiters.push(resolve));
  return acquire.then(async () => {
    try {
      return await run();
    } finally {
      const next = imageWaiters.shift();
      if (next) next();
      else imagePermits++;
    }
  });
}

/**
 * A deck key's uploaded custom-image icon as an object URL, or null while
 * loading / absent / failed. Shared by DeckGrid (on-screen tile/key preview)
 * and IconPicker (Custom tab preview); mirrors useAppIcon's shape exactly.
 */
export function useDeckImage(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setUrl(null); return; }
    setUrl(null);
    let revoke = '';
    let cancelled = false;
    void withImageSlot(async () => {
      if (cancelled) return;
      const blob = await fetchDeckImage(id);
      if (!cancelled && blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        revoke = objectUrl;
        setUrl(objectUrl);
      }
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id]);

  return url;
}
