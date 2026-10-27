import { type CSSProperties, useCallback, useEffect, useRef } from 'react';
import { backgroundMediaFileUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

export const NULL_ERROR_GRACE_MS = 5_000;

export function PanelBackgroundMedia({
  id,
  deviceId,
  type,
  alpha,
  opacity,
  ready = true,
  loop = true,
  covered = false,
  onLoaded,
  onFadedIn,
  onFailed,
  onVideoMetadata,
  onVideoEnded,
}: {
  id: string;
  deviceId: string;
  type: 'static' | 'animated';
  /** Transparent assets are png/gif, so an animated one still renders in an <img>. */
  alpha?: boolean;
  opacity: number;
  /** False keeps the layer at opacity 0 (its fade-in held back) until the
   * slideshow has the asset decoded; the single-background case is always ready. */
  ready?: boolean;
  /** A slideshow paces a video itself and turns the element's own loop off. */
  loop?: boolean;
  /** An opaque widget hides the whole background: hold the video on its current frame. */
  covered?: boolean;
  onLoaded?: () => void;
  /** The layer's opacity transition has finished after `ready` went true. */
  onFadedIn?: () => void;
  onFailed?: () => void;
  onVideoMetadata?: (video: HTMLVideoElement) => void;
  onVideoEnded?: (video: HTMLVideoElement) => void;
}) {
  const url = backgroundMediaFileUrl(deviceId, id);
  const style = { '--panel-background-opacity': opacity } as CSSProperties;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const graceTimerRef = useRef(0);
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  });

  useEffect(() => {
    if (covered) videoRef.current?.pause();
    else videoRef.current?.play().catch(() => {});
  }, [url, covered]);

  // A removed video otherwise holds its hardware decoder until GC, and a panel
  // with a single decoder cannot start the next clip. A ref callback pairs
  // with the element itself: it runs during the deletion, before a keyed
  // sibling's commit, and for an element that outlives one effect run. The
  // setup restores a src the cleanup stripped (StrictMode's simulated remount
  // never rewrites an unchanged prop); a changed url is written by React
  // between the cleanup and the setup.
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) return;
    if (!video.hasAttribute('src')) video.setAttribute('src', url);
    return () => {
      window.clearTimeout(graceTimerRef.current);
      videoRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  return (
    <div
      className={styles.backgroundMedia}
      data-ready={ready ? 'true' : undefined}
      data-panel-bg-layer
      style={style}
      aria-hidden="true"
      onTransitionEnd={onFadedIn && ready ? e => { if (e.target === e.currentTarget && e.propertyName === 'opacity') onFadedIn(); } : undefined}
    >
      {type === 'static' || alpha ? (
        <img
          src={url}
          alt=""
          className={styles.backgroundMediaContent}
          onLoad={onLoaded}
          onError={onFailed}
        />
      ) : (
        <video
          ref={attachVideo}
          src={url}
          className={`${styles.backgroundMediaContent} ${styles.backgroundMediaVideo}`}
          autoPlay={!covered}
          loop={loop}
          muted
          playsInline
          onCanPlay={onLoaded}
          onError={e => {
            const video = e.currentTarget;
            window.clearTimeout(graceTimerRef.current);
            if (video.error) {
              onFailedRef.current?.();
              return;
            }
            // Chrome 83 WebViews fire `error` with no MediaError on clips that
            // then play, so wait before giving up.
            graceTimerRef.current = window.setTimeout(() => {
              if (videoRef.current === video && (video.error || video.readyState < 2)) {
                onFailedRef.current?.();
              }
            }, NULL_ERROR_GRACE_MS);
          }}
          onLoadedMetadata={onVideoMetadata ? e => onVideoMetadata(e.currentTarget) : undefined}
          onEnded={onVideoEnded ? e => onVideoEnded(e.currentTarget) : undefined}
        />
      )}
    </div>
  );
}
