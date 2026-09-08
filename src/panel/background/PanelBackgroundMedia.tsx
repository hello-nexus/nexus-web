import { type CSSProperties, useEffect, useRef } from 'react';
import { backgroundMediaFileUrl } from '../../api/panelBackgroundMedia';
import styles from '../PanelApp.module.scss';

export function PanelBackgroundMedia({ id, deviceId, type, alpha, opacity }: {
  id: string;
  deviceId: string;
  type: 'static' | 'animated';
  /** Transparent assets are png/gif, so an animated one still renders in an <img>. */
  alpha?: boolean;
  opacity: number;
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
      data-ready="true"
      data-panel-bg-layer
      style={style}
      aria-hidden="true"
    >
      {type === 'static' || alpha ? (
        <img
          src={url}
          alt=""
          className={styles.backgroundMediaContent}
        />
      ) : (
        <video
          ref={videoRef}
          src={url}
          className={styles.backgroundMediaContent}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
    </div>
  );
}
