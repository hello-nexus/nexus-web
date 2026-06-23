import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { clampNumber } from '../../../panel/engine/panelGrid';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import styles from './MediaCropper.module.scss';

export interface NormalizedCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface DragState {
  kind: 'pan' | Corner;
  startX: number;
  startY: number;
  startCrop: NormalizedCrop;
  imgW: number;
  imgH: number;
  normAspect: number;
}

type MediaEl = HTMLImageElement | HTMLVideoElement;

// Intrinsic pixel dimensions of the source, whether <img> (naturalWidth) or
// <video> (videoWidth). A <video> reports 0 until loadedmetadata fires.
function intrinsicOf(el: MediaEl | null): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  return { w: 0, h: 0 };
}

export function MediaCropper({ src, kind = 'image', aspect, initialCrop, busy, onConfirm, onCancel }: {
  src: string;
  /** 'video' renders a <video> frame to crop against; 'image' (default) an <img>. */
  kind?: 'image' | 'video';
  aspect: number;
  initialCrop?: NormalizedCrop;
  busy?: boolean;
  onConfirm: (crop: NormalizedCrop) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const mediaRef = useRef<MediaEl | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<NormalizedCrop>(initialCrop ?? { x: 0, y: 0, w: 1, h: 1 });
  const cropRef = useRef(crop);
  useEffect(() => { cropRef.current = crop; }, [crop]);
  const dragRef = useRef<DragState | null>(null);

  // Normalized w/h ratio that yields the target pixel aspect for this source:
  // (w*nw)/(h*nh) = aspect  =>  w/h = aspect*nh/nw.
  const normAspectFor = useCallback(
    (nw: number, nh: number) => (nw && nh ? aspect * nh / nw : aspect),
    [aspect],
  );

  const centerCropForAspect = useCallback((nw: number, nh: number): NormalizedCrop => {
    const r = normAspectFor(nw, nh);
    const w = r <= 1 ? r : 1;
    const h = r <= 1 ? 1 : 1 / r;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }, [normAspectFor]);

  const measureImg = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) setImgSize({ w: rect.width, h: rect.height });
  }, []);

  const onMediaLoad = useCallback(() => {
    measureImg();
    const { w, h } = intrinsicOf(mediaRef.current);
    if (w && !initialCrop) setCrop(centerCropForAspect(w, h));
  }, [measureImg, initialCrop, centerCropForAspect]);

  useEffect(() => {
    const observer = new ResizeObserver(() => measureImg());
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [measureImg]);

  const handlePointerDown = useCallback((e: React.PointerEvent, kind: DragState['kind']) => {
    e.stopPropagation();
    e.preventDefault();
    const el = mediaRef.current;
    const { w: nw, h: nh } = intrinsicOf(el);
    if (!el || !nw) return;
    const rect = el.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...cropRef.current },
      imgW: rect.width,
      imgH: rect.height,
      normAspect: normAspectFor(nw, nh),
    };
  }, [normAspectFor]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.imgW;
    const dy = (e.clientY - drag.startY) / drag.imgH;
    const { x: sx, y: sy, w: sw, h: sh } = drag.startCrop;

    if (drag.kind === 'pan') {
      setCrop({
        x: clampNumber(sx + dx, 0, 1 - sw),
        y: clampNumber(sy + dy, 0, 1 - sh),
        w: sw,
        h: sh,
      });
      return;
    }

    // Resize a corner: derive w from the drag, lock h = w / normAspect, and
    // bound w so the aspect-locked rect stays inside the image from the fixed
    // (opposite) anchor.
    const r = drag.normAspect;
    const anchorRight = drag.kind === 'bl' || drag.kind === 'tl';
    const anchorBottom = drag.kind === 'tr' || drag.kind === 'tl';
    const availW = anchorRight ? sx + sw : 1 - sx;
    const availH = anchorBottom ? sy + sh : 1 - sy;
    const maxW = Math.max(0.02, Math.min(availW, availH * r));
    const desiredW = (drag.kind === 'br' || drag.kind === 'tr') ? sw + dx : sw - dx;
    const w = clampNumber(desiredW, 0.02, maxW);
    const h = w / r;
    setCrop({
      x: anchorRight ? sx + sw - w : sx,
      y: anchorBottom ? sy + sh - h : sy,
      w,
      h,
    });
  }, []);

  const handlePointerUp = useCallback(() => { dragRef.current = null; }, []);

  const handleReset = useCallback(() => {
    const { w, h } = intrinsicOf(mediaRef.current);
    if (w) setCrop(centerCropForAspect(w, h));
  }, [centerCropForAspect]);

  // DeviceModal/Overlay handles Escape→cancel; Enter confirms. Both no-op when busy.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(cropRef.current); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, onConfirm]);

  const setRef = (el: MediaEl | null) => { mediaRef.current = el; };

  return (
    <DeviceModal open onClose={busy ? () => {} : onCancel} title={t('cropper.title')} large>
      <div
        ref={wrapRef}
        className={styles.canvasWrap}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {kind === 'video' ? (
          <video
            ref={setRef}
            src={src}
            className={styles.img}
            muted
            loop
            autoPlay
            playsInline
            onLoadedMetadata={onMediaLoad}
            onLoadedData={onMediaLoad}
          />
        ) : (
          <img ref={setRef} src={src} alt="" className={styles.img} onLoad={onMediaLoad} draggable={false} />
        )}
        {imgSize && (
          <div
            className={styles.cropRect}
            style={{
              left: `calc(50% - ${imgSize.w / 2}px + ${crop.x * imgSize.w}px)`,
              top: `calc(50% - ${imgSize.h / 2}px + ${crop.y * imgSize.h}px)`,
              width: `${crop.w * imgSize.w}px`,
              height: `${crop.h * imgSize.h}px`,
            }}
            role="presentation"
            onPointerDown={e => handlePointerDown(e, 'pan')}
          >
            <div className={`${styles.handle} ${styles.handleTL}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'tl')} />
            <div className={`${styles.handle} ${styles.handleTR}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'tr')} />
            <div className={`${styles.handle} ${styles.handleBL}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'bl')} />
            <div className={`${styles.handle} ${styles.handleBR}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'br')} />
          </div>
        )}
        {busy && (
          <div className={styles.busyOverlay} aria-live="polite">
            {t('cropper.converting')}
          </div>
        )}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={handleReset} disabled={busy}>{t('cropper.reset')}</button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>{t('cropper.cancel')}</button>
        <button type="button" className={styles.confirmBtn} onClick={() => onConfirm(cropRef.current)} disabled={busy}>{t('cropper.confirm')}</button>
      </div>
    </DeviceModal>
  );
}
