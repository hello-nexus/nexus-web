import { useEffect, useMemo, useRef, useState } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { desktopWallpaperUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

const FETCH_RETRY_LIMIT = 2;

/**
 * The desktop-wallpaper background layer (background toggled off on a
 * kiosk-hosted panel): the monitor's own wallpaper crop, with no icons,
 * taskbar, or windows. Candidates are preloaded off-DOM and swapped in on
 * success, so a refetch never flashes and a failed fetch keeps the last
 * good image (or the theme backdrop when none loaded yet).
 */
export function PanelBackgroundDesktop() {
  const [candidate, setCandidate] = useState(0);
  const [goodSrc, setGoodSrc] = useState<string | null>(null);
  const retriesRef = useRef(0);
  useTopicCallback('desktopWallpaper', true, () => {
    retriesRef.current = 0;
    setCandidate(c => c + 1);
  });
  // Native px so the service can match the shell's per-monitor cached crop.
  // A live kiosk resize recreates the kiosk (fresh page), so mount-time size
  // is stable for the page's lifetime.
  const size = useMemo(() => ({
    w: Math.round(window.innerWidth * window.devicePixelRatio),
    h: Math.round(window.innerHeight * window.devicePixelRatio),
  }), []);

  const url = desktopWallpaperUrl(size.w, size.h, candidate);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const img = new Image();
    img.onload = () => { if (!cancelled) setGoodSrc(url); };
    img.onerror = () => {
      if (cancelled || retriesRef.current >= FETCH_RETRY_LIMIT) return;
      retriesRef.current += 1;
      // The shell exposes no completion signal for its wallpaper rewrite; a
      // delayed retry covers a fetch that raced the tail of the write burst.
      retryTimer = setTimeout(() => { if (!cancelled) setCandidate(c => c + 1); }, 3000);
    };
    img.src = url;
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [url]);

  if (!goodSrc) return null;
  return (
    <div className={styles.backgroundMedia} data-ready="true" aria-hidden>
      <img
        className={styles.backgroundMediaContent}
        src={goodSrc}
        alt=""
        draggable={false}
      />
    </div>
  );
}
