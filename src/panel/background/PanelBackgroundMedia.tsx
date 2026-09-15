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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // The kiosk (and the live theme preview) is a real, visible WebView2
  // surface, so a <video> element left in the rendered layout is exactly
  // what Chromium's display-sleep power blocker looks for: it arms for any
  // playing video that's actually part of the visible page, and never lets
  // go while the loop keeps playing - so the host PC stops sleeping for as
  // long as a Media backdrop is on screen. display:none pulls the <video>
  // out of layout (no LayoutObject), which disqualifies it from that check
  // while playback/decoding carries on unaffected; a canvas mirror painted
  // from its frames every rAF reproduces the same loop for the visible
  // layer, since a canvas isn't a media element Chromium tracks that way.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    video.play().catch(() => {});

    const ctx = canvas.getContext('2d', { alpha: false });
    let raf = requestAnimationFrame(function draw() {
      raf = requestAnimationFrame(draw);
      const { videoWidth: w, videoHeight: h } = video;
      if (!w || !h || video.readyState < video.HAVE_CURRENT_DATA) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx?.drawImage(video, 0, 0, w, h);
    });

    return () => cancelAnimationFrame(raf);
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
        <>
          <video
            ref={videoRef}
            src={url}
            className={styles.backgroundMediaSource}
            autoPlay
            loop
            muted
            playsInline
          />
          <canvas ref={canvasRef} className={styles.backgroundMediaContent} />
        </>
      )}
    </div>
  );
}
