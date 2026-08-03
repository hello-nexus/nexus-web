import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { clampNumber } from '../../../panel/engine/panelGrid';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import {
  flipHorizontal,
  flipVertical,
  normalizeRotate,
  type NormalizedCrop,
  type Orientation,
  rotateCcw,
  rotateCw,
} from './mediaCrop';
import styles from './MediaCropper.module.scss';

export type { NormalizedCrop } from './mediaCrop';

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

function orientedDims(w: number, h: number, rotate: number): { w: number; h: number } {
  return rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h };
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
  const [intrinsic, setIntrinsic] = useState<{ w: number; h: number } | null>(null);
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number } | null>(null);
  const [orient, setOrient] = useState<Orientation>({
    rotate: normalizeRotate(initialCrop?.rotate),
    mirror: !!initialCrop?.mirror,
  });
  const [crop, setCrop] = useState<NormalizedCrop>(initialCrop ?? { x: 0, y: 0, w: 1, h: 1 });
  const cropRef = useRef(crop);
  useEffect(() => { cropRef.current = crop; }, [crop]);
  const orientRef = useRef(orient);
  useEffect(() => { orientRef.current = orient; }, [orient]);
  const dragRef = useRef<DragState | null>(null);

  // Oriented intrinsic dimensions (a quarter turn swaps W/H). The crop rect is
  // normalized against this oriented frame - the same frame the service crops.
  const oriented = useMemo(
    () => (intrinsic ? orientedDims(intrinsic.w, intrinsic.h, orient.rotate) : null),
    [intrinsic, orient.rotate],
  );

  // Normalized w/h ratio that yields the target pixel aspect for the oriented
  // source: (w*ow)/(h*oh) = aspect  =>  w/h = aspect*oh/ow.
  const normAspectFor = useCallback(
    (ow: number, oh: number) => (ow && oh ? aspect * oh / ow : aspect),
    [aspect],
  );

  const centerCropForAspect = useCallback((ow: number, oh: number): NormalizedCrop => {
    const r = normAspectFor(ow, oh);
    const w = r <= 1 ? r : 1;
    const h = r <= 1 ? 1 : 1 / r;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }, [normAspectFor]);

  // On-screen footprint of the oriented media, contain-fit into the wrapper,
  // and the pre-rotation element box that, once rotated, renders to it.
  const layout = useMemo(() => {
    if (!wrapSize || !oriented) return null;
    const oa = oriented.w / oriented.h;
    const wa = wrapSize.w / wrapSize.h;
    let dispW: number;
    let dispH: number;
    if (oa > wa) { dispW = wrapSize.w; dispH = wrapSize.w / oa; }
    else { dispH = wrapSize.h; dispW = wrapSize.h * oa; }
    const swap = orient.rotate === 90 || orient.rotate === 270;
    const mediaBox = swap ? { w: dispH, h: dispW } : { w: dispW, h: dispH };
    return { dispW, dispH, mediaBox };
  }, [wrapSize, oriented, orient.rotate]);

  const measureWrap = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) setWrapSize({ w: rect.width, h: rect.height });
  }, []);

  const onMediaLoad = useCallback(() => {
    measureWrap();
    const { w, h } = intrinsicOf(mediaRef.current);
    if (!w || !h) return;
    setIntrinsic({ w, h });
    if (!initialCrop) {
      const od = orientedDims(w, h, orientRef.current.rotate);
      setCrop(centerCropForAspect(od.w, od.h));
    }
  }, [measureWrap, initialCrop, centerCropForAspect]);

  useEffect(() => {
    const observer = new ResizeObserver(() => measureWrap());
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [measureWrap]);

  const applyOrientation = useCallback((next: Orientation) => {
    const prev = orientRef.current;
    setOrient(next);
    if (!intrinsic) return;
    const before = orientedDims(intrinsic.w, intrinsic.h, prev.rotate);
    const after = orientedDims(intrinsic.w, intrinsic.h, next.rotate);
    // Re-center the crop only when the oriented frame's dimensions change (a
    // quarter turn); a pure mirror keeps the user's existing framing.
    if (before.w !== after.w || before.h !== after.h) {
      setCrop(centerCropForAspect(after.w, after.h));
    }
  }, [intrinsic, centerCropForAspect]);

  const handlePointerDown = useCallback((e: React.PointerEvent, kind: DragState['kind']) => {
    e.stopPropagation();
    e.preventDefault();
    if (!layout || !oriented) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...cropRef.current },
      imgW: layout.dispW,
      imgH: layout.dispH,
      normAspect: normAspectFor(oriented.w, oriented.h),
    };
  }, [layout, oriented, normAspectFor]);

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
    if (oriented) setCrop(centerCropForAspect(oriented.w, oriented.h));
  }, [oriented, centerCropForAspect]);

  const buildResult = useCallback((): NormalizedCrop => ({
    ...cropRef.current,
    rotate: orientRef.current.rotate,
    mirror: orientRef.current.mirror,
  }), []);

  // DeviceModal/Overlay handles Escape→cancel; Enter confirms. Both no-op when busy.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(buildResult()); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, onConfirm, buildResult]);

  const setRef = (el: MediaEl | null) => { mediaRef.current = el; };

  const mediaStyle = layout
    ? {
        width: `${layout.mediaBox.w}px`,
        height: `${layout.mediaBox.h}px`,
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: 'fill' as const,
        transform: `rotate(${orient.rotate}deg) scaleX(${orient.mirror ? -1 : 1})`,
      }
    : undefined;

  const controlsDisabled = busy || !layout;

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
            style={mediaStyle}
            muted
            loop
            autoPlay
            playsInline
            onLoadedMetadata={onMediaLoad}
            onLoadedData={onMediaLoad}
          />
        ) : (
          <img ref={setRef} src={src} alt="" className={styles.img} style={mediaStyle} onLoad={onMediaLoad} draggable={false} />
        )}
        {layout && (
          <div
            className={styles.cropRect}
            style={{
              left: `calc(50% - ${layout.dispW / 2}px + ${crop.x * layout.dispW}px)`,
              top: `calc(50% - ${layout.dispH / 2}px + ${crop.y * layout.dispH}px)`,
              width: `${crop.w * layout.dispW}px`,
              height: `${crop.h * layout.dispH}px`,
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
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolBtn} onClick={() => applyOrientation(rotateCcw(orient))} disabled={controlsDisabled} aria-label={t('cropper.rotateCcw')} title={t('cropper.rotateCcw')}>
          <RotateCcw size={16} />
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => applyOrientation(rotateCw(orient))} disabled={controlsDisabled} aria-label={t('cropper.rotateCw')} title={t('cropper.rotateCw')}>
          <RotateCw size={16} />
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => applyOrientation(flipHorizontal(orient))} disabled={controlsDisabled} aria-label={t('cropper.flipH')} title={t('cropper.flipH')}>
          <FlipHorizontal2 size={16} />
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => applyOrientation(flipVertical(orient))} disabled={controlsDisabled} aria-label={t('cropper.flipV')} title={t('cropper.flipV')}>
          <FlipVertical2 size={16} />
        </button>
      </div>
      <div className={styles.footer}>
        <Button tone="ghost" className={styles.resetBtn} onClick={handleReset} disabled={busy}>{t('cropper.reset')}</Button>
        <Button tone="neutral" onClick={onCancel} disabled={busy}>{t('cropper.cancel')}</Button>
        <Button tone="accent" onClick={() => onConfirm(buildResult())} disabled={busy}>{t('cropper.confirm')}</Button>
      </div>
    </DeviceModal>
  );
}
