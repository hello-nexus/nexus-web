import { useEffect, useState } from 'react';
import { fetchSiteIcon } from '../../../api/siteIcon';
import { withMediaFetchSlot as withImageSlot } from '../../../lib/mediaFetchSlot';

/** Typing in the inspector's URL field rewrites the slot per keystroke; settle before spending a permit. */
const TYPING_SETTLE_MS = 400;

/**
 * Ceiling on how long one lookup may hold its media-fetch permit. Every other
 * consumer of that pool reads local disk and returns in milliseconds; this one
 * waits on the service's outbound fetch, which can walk several candidate URLs
 * against an unreachable host before giving up.
 */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * A URL key's site icon as an object URL, or null while loading / absent /
 * failed. Lifecycle mirrors useDeckImage; the debounce and timeout are the
 * two differences, both because the key is free text and the source is remote.
 */
export function useSiteIcon(url: string | undefined): string | null {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) { setIconUrl(null); return; }
    setIconUrl(null);
    let revoke = '';
    let cancelled = false;

    const timer = setTimeout(() => {
      void withImageSlot(async () => {
        if (cancelled) return;
        // Releases the permit on a stalled lookup; the fetch itself is left to
        // finish into the service's cache, where a later mount picks it up.
        const blob = await Promise.race([
          fetchSiteIcon(url),
          new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
        ]);
        if (!cancelled && blob && blob.size > 0) {
          const objectUrl = URL.createObjectURL(blob);
          revoke = objectUrl;
          setIconUrl(objectUrl);
        }
      });
    }, TYPING_SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);

  return iconUrl;
}
