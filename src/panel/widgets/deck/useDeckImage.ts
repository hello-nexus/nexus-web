import { useEffect, useState } from 'react';
import { fetchDeckImage } from '../../../api/deckImages';
import { withMediaFetchSlot as withImageSlot } from '../../../lib/mediaFetchSlot';

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
