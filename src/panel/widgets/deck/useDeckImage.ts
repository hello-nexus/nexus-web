import { useEffect, useState } from 'react';
import { fetchDeckImage } from '../../../api/deckImages';
import { withMediaFetchSlot as withImageSlot } from '../../../lib/mediaFetchSlot';

const NONE = { url: null, isVideo: false };

/** A deck key's custom image as an object URL (null while loading, absent or failed) plus whether the blob is a video. */
export function useDeckImage(id: string | undefined): { url: string | null; isVideo: boolean } {
  const [state, setState] = useState<{ url: string | null; isVideo: boolean }>({ url: null, isVideo: false });

  useEffect(() => {
    if (!id) { setState(NONE); return; }
    setState(NONE);
    let revoke = '';
    let cancelled = false;
    void withImageSlot(async () => {
      if (cancelled) return;
      const blob = await fetchDeckImage(id);
      if (!cancelled && blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        revoke = objectUrl;
        setState({ url: objectUrl, isVideo: blob.type.startsWith('video/') });
      }
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id]);

  return state;
}
