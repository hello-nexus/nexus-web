import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { clampNumber } from '../../../panel/engine/panelGrid';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import {
  centerCropForAspect as centerCropFor,
  flipHorizontal,
  flipVertical,
  normAspectFor as normAspect,
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

export function MediaCropper({ src, kind = 'image', fallbackSrc, aspect, initialCrop, busy, allowTransparency, allowFit, onConfirm, onCancel }: {
  src: string;
  /** 'video' renders a <video> frame to crop against; 'image' (default) an <img>. */
  kind?: 'image' | 'video';
  /** Still to crop against when `src` fails to decode (a codec the browser lacks). */
  fallbackSrc?: string;
  aspect: number;
  initialCrop?: NormalizedCrop;
  busy?: boolean;
  /** Offer the "keep transparency" choice. Only pass it for a source that has alpha to keep. */
  allowTransparency?: boolean;
  /** Offer "fit entire image": the whole frame, letterboxed by the consumer, instead of a crop. */
  allowFit?: boolean;
  onConfirm: (crop: NormalizedCrop, keepTransparency: boolean, fit: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const mediaRef = useRef<MediaEl | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [intrinsic, setIntrinsic] = useState<{ w: number; h: number } | null>(null);
  // A source the browser cannot decode never reports a size; without a
  // fallback the cropper would sit with no rect and a confirm that crops blind.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const useFallback = failedSrc === src && !!fallbackSrc;
  const shownSrc = useFallback ? fallbackSrc! : src;
  const shownKind = useFallback ? 'image' : kind;
  const onMediaError = useCallback(() => { setFailedSrc(src); }, [src]);
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number } | null>(null);
  const [orient, setOrient] = useState<Orientation>({
    rotate: normalizeRotate(initialCrop?.rotate),
    mirror: !!initialCrop?.mirror,
  });
  const [crop, setCrop] = useState<NormalizedCrop>(initialCrop ?? { x: 0, y: 0, w: 1, h: 1 });
  const [keepTransparency, setKeepTransparency] = useState(true);
  const keepTransparencyRef = useRef(keepTransparency);
  useEffect(() => { keepTransparencyRef.current = keepTransparency; }, [keepTransparency]);
  const [fitWhole, setFitWhole] = useState(false);
  const fitWholeRef = useRef(fitWhole);
  useEffect(() => { fitWholeRef.current = fitWhole; }, [fitWhole]);
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

  const normAspectFor = useCallback(
    (ow: number, oh: number) => normAspect(aspect, ow, oh),
    [aspect],
  );

  const centerCropForAspect = useCallback(
    (ow: number, oh: number): NormalizedCrop => centerCropFor(aspect, ow, oh),
    [aspect],
  );

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
      setCrop(fitWholeRef.current ? { x: 0, y: 0, w: 1, h: 1 } : centerCropForAspect(after.w, after.h));
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
    if (!oriented) return;
    setCrop(fitWholeRef.current ? { x: 0, y: 0, w: 1, h: 1 } : centerCropForAspect(oriented.w, oriented.h));
  }, [oriented, centerCropForAspect]);

  const buildResult = useCallback((): NormalizedCrop => ({
    ...cropRef.current,
    rotate: orientRef.current.rotate,
    mirror: orientRef.current.mirror,
  }), []);

  const confirm = useCallback(() => {
    const fit = fitWholeRef.current;
    const result = fit
      ? { x: 0, y: 0, w: 1, h: 1, rotate: orientRef.current.rotate, mirror: orientRef.current.mirror }
      : buildResult();
    onConfirm(result, keepTransparencyRef.current, fit);
  }, [onConfirm, buildResult]);

  // Fitting takes the whole frame, so the rect snaps to it; turning it off
  // returns to the largest centred crop.
  const toggleFit = useCallback(() => {
    const next = !fitWhole;
    setFitWhole(next);
    if (next) setCrop({ x: 0, y: 0, w: 1, h: 1 });
    else if (oriented) setCrop(centerCropForAspect(oriented.w, oriented.h));
  }, [fitWhole, oriented, centerCropForAspect]);

  // DeviceModal/Overlay handles Escape→cancel; Enter confirms. Both no-op when busy.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, confirm]);

  const setRef = (el: MediaEl | null) => { mediaRef.current = el; };

  // The commit deletes the stage; a <video> still streaming it keeps the file
  // open on Windows and the delete silently fails until the next sweep.
  useEffect(() => {
    if (!busy) return;
    const el = mediaRef.current;
    if (el instanceof HTMLVideoElement) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  }, [busy]);

  const showChecker = !!allowTransparency && keepTransparency;

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
        {shownKind === 'video' ? (
          <video
            ref={setRef}
            src={shownSrc}
            className={styles.img}
            style={mediaStyle}
            muted
            loop
            autoPlay
            playsInline
            onLoadedMetadata={onMediaLoad}
            onLoadedData={onMediaLoad}
            onError={onMediaError}
          />
        ) : (
          <img
            ref={setRef}
            src={shownSrc}
            alt=""
            className={`${styles.img} ${showChecker ? styles.checker : ''}`}
            style={mediaStyle}
            onLoad={onMediaLoad}
            onError={useFallback ? undefined : onMediaError}
            draggable={false}
          />
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
            onPointerDown={fitWhole ? undefined : e => handlePointerDown(e, 'pan')}
          >
            {!fitWhole && (
              <>
                <div className={`${styles.handle} ${styles.handleTL}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'tl')} />
                <div className={`${styles.handle} ${styles.handleTR}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'tr')} />
                <div className={`${styles.handle} ${styles.handleBL}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'bl')} />
                <div className={`${styles.handle} ${styles.handleBR}`} role="presentation" onPointerDown={e => handlePointerDown(e, 'br')} />
              </>
            )}
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
        {allowFit && (
          <label className={styles.keepAlpha}>
            <input
              type="checkbox"
              checked={fitWhole}
              disabled={controlsDisabled}
              onChange={toggleFit}
            />
            <span>{t('cropper.fitWhole')}</span>
          </label>
        )}
        {allowTransparency && (
          <label className={styles.keepAlpha}>
            <input
              type="checkbox"
              checked={keepTransparency}
              disabled={busy}
              onChange={() => setKeepTransparency(prev => !prev)}
            />
            <span>{t('cropper.keepTransparency')}</span>
          </label>
        )}
      </div>
      <div className={styles.footer}>
        <Button tone="ghost" className={styles.resetBtn} onClick={handleReset} disabled={busy}>{t('cropper.reset')}</Button>
        <Button tone="neutral" onClick={onCancel} disabled={busy}>{t('cropper.cancel')}</Button>
        <Button tone="accent" onClick={confirm} disabled={busy}>{t('cropper.confirm')}</Button>
      </div>
    </DeviceModal>
  );
}
