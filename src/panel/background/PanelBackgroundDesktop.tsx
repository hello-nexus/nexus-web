import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { desktopWallpaperUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

const FETCH_RETRY_LIMIT = 2;

/**
 * The desktop-wallpaper background layer (background toggled off on a
 * kiosk-hosted panel): the monitor's own wallpaper crop, with no icons,
 * taskbar, or windows. Candidates are preloaded off-DOM and swapped in on
 * success, so a refetch never flashes and a failed fetch keeps the last
 * good image (or the theme backdrop when none loaded yet). `opacity` fades
 * the wallpaper toward the theme's dark/light backdrop, same as the
 * shader/media layers.
 */
export function PanelBackgroundDesktop({ opacity = 1 }: { opacity?: number }) {
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
      if (cancelled) return;
      retriesRef.current += 1;
      // The shell exposes no completion signal for its wallpaper rewrite; a
      // short retry covers a fetch that raced the tail of the write burst.
      // Past the fast retries, fall to a slow probe so a panel that booted
      // mid-rewrite (or before logon) eventually shows the wallpaper instead
      // of giving up until the next change frame.
      const delay = retriesRef.current <= FETCH_RETRY_LIMIT ? 3000 : 60000;
      retryTimer = setTimeout(() => { if (!cancelled) setCandidate(c => c + 1); }, delay);
    };
    img.src = url;
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [url]);

  if (!goodSrc) return null;
  return (
    <div
      className={styles.backgroundMedia}
      data-ready="true"
      data-panel-bg-layer
      style={{ '--panel-background-opacity': opacity } as CSSProperties}
      aria-hidden
    >
      <img
        className={styles.backgroundMediaContent}
        src={goodSrc}
        alt=""
        draggable={false}
      />
    </div>
  );
}
