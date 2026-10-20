import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMediaCurrent } from '../../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../../api/service';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import styles from '../LightingPage.module.scss';

/**
 * The Media tab's canvas when it is open for media-pinned cards while another mode runs
 * globally: the canvas stream shows the global mode's output, so this draws a still of the
 * current media instead. With Media global the stream already shows the media, so the
 * caller does not mount this.
 */
export function MediaBackdrop() {
  const [url, setUrl] = useState<string | null>(null);
  // The media the shown still belongs to; null until one loaded, so a failed fetch retries.
  const shownIdRef = useRef<string | null>(null);
  const urlRef = useRef<string | null>(null);
  // Only the latest refresh may apply its result: broadcasts can overlap.
  const seqRef = useRef(0);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const current = await fetchMediaCurrent();
    if (!current || seq !== seqRef.current || !aliveRef.current) return;
    const id = current.mediaId ?? null;
    if (id !== null && id === shownIdRef.current) return;
    const blob = id ? await fetchServiceBlob(`/media/${encodeURIComponent(id)}/thumbnail`, { mayBeCached: true }) : null;
    if (seq !== seqRef.current || !aliveRef.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = blob ? URL.createObjectURL(blob) : null;
    shownIdRef.current = blob ? id : null;
    setUrl(urlRef.current);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [refresh]);
  // A pick on the Media tab changes the current media, announced as a lighting broadcast.
  useTopicCallback('lighting', true, refresh);

  return url ? <img className={styles.mediaBackdrop} src={url} alt="" aria-hidden="true" draggable={false} /> : null;
}
