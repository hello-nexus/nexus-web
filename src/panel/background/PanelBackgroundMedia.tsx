import { type CSSProperties, useEffect, useRef } from 'react';
import { backgroundMediaFileUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

export function PanelBackgroundMedia({
  id,
  deviceId,
  type,
  alpha,
  opacity,
  ready = true,
  loop = true,
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

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
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
          ref={videoRef}
          src={url}
          className={styles.backgroundMediaContent}
          autoPlay
          loop={loop}
          muted
          playsInline
          onCanPlay={onLoaded}
          onError={onFailed}
          onLoadedMetadata={onVideoMetadata ? e => onVideoMetadata(e.currentTarget) : undefined}
          onEnded={onVideoEnded ? e => onVideoEnded(e.currentTarget) : undefined}
        />
      )}
    </div>
  );
}
