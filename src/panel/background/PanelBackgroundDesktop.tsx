import { useMemo, useState } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { desktopWallpaperUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

/**
 * The desktop-wallpaper background layer (background toggled off on a
 * kiosk-hosted panel): the monitor's own wallpaper crop, with no icons,
 * taskbar, or windows. A load failure renders nothing, leaving the theme
 * backdrop.
 */
export function PanelBackgroundDesktop() {
  const [revision, setRevision] = useState(0);
  const [failedRevision, setFailedRevision] = useState(-1);
  const [ready, setReady] = useState(false);
  useTopicCallback('desktopWallpaper', true, () => setRevision(r => r + 1));
  // Native px so the service can match the shell's per-monitor cached crop.
  const size = useMemo(() => ({
    w: Math.round(window.innerWidth * window.devicePixelRatio),
    h: Math.round(window.innerHeight * window.devicePixelRatio),
  }), []);
  if (failedRevision === revision) return null;
  return (
    <div className={styles.backgroundMedia} data-ready={ready ? 'true' : undefined} aria-hidden>
      <img
        className={styles.backgroundMediaContent}
        src={desktopWallpaperUrl(size.w, size.h, revision)}
        onLoad={() => setReady(true)}
        onError={() => setFailedRevision(revision)}
        alt=""
        draggable={false}
      />
    </div>
  );
}
