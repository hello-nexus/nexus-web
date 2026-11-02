import { useEffect, useRef, useState } from 'react';

interface ContentBox {
  /** The drawing's width over its height. */
  aspect: number;
  /** The drawing's width as a share of the whole image. */
  widthShare: number;
  inset: string;
}

const PROBE_SIDE = 128;
const ALPHA_MIN = 8;

/**
 * The drawn part of a transparent snapshot, found once the image loads: the picture is fitted into its square with empty
 * margins, so the logo above it would float apart from the drawing. Cropping the image's box to its content (object-view-box)
 * lets the logo sit just above the drawing, centered on it. Where the browser cannot read the pixels or crop the view
 * (an old kiosk Chromium), the box stays whole and the logo centers on it.
 */
function useContentBox(src: string): ContentBox | null {
  const [box, setBox] = useState<ContentBox | null>(null);
  useEffect(() => {
    setBox(null);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = PROBE_SIDE;
        canvas.height = PROBE_SIDE;
        const ctx = canvas.getContext('2d');
        if (!ctx || !img.naturalWidth || !img.naturalHeight) return;
        ctx.drawImage(img, 0, 0, PROBE_SIDE, PROBE_SIDE);
        const { data } = ctx.getImageData(0, 0, PROBE_SIDE, PROBE_SIDE);
        let x0 = PROBE_SIDE, y0 = PROBE_SIDE, x1 = -1, y1 = -1;
        for (let y = 0; y < PROBE_SIDE; y++) {
          for (let x = 0; x < PROBE_SIDE; x++) {
            if (data[(y * PROBE_SIDE + x) * 4 + 3] > ALPHA_MIN) {
              x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
          }
        }
        if (x1 < 0 || cancelled) return;
        const pct = (n: number) => `${((n / PROBE_SIDE) * 100).toFixed(2)}%`;
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        setBox({
          aspect: (w * img.naturalWidth) / (h * img.naturalHeight),
          widthShare: w / PROBE_SIDE,
          inset: `inset(${pct(y0)} ${pct(PROBE_SIDE - 1 - x1)} ${pct(PROBE_SIDE - 1 - y1)} ${pct(x0)})`,
        });
      } catch {
        // The pixels are unreadable here; the whole box stays.
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return box;
}

/** The size a picture of this shape has at a target width, its proportions kept. */
export function scaledSize(naturalWidth: number, naturalHeight: number, targetWidth: number): { width: number; height: number } {
  return { width: targetWidth, height: Math.max(1, Math.round((targetWidth * naturalHeight) / naturalWidth)) };
}

/**
 * The image resampled once, at the width it is shown (its CSS width times the device pixel ratio), by halving steps with
 * smoothing, its proportions kept. The browser's own one-step shrink of a large picture skips pixels, which breaks thin
 * lines into stairs; this keeps them smooth at 1x as well as at higher ratios. Resolves null (the original shows) where
 * canvas is unavailable or the picture is already no larger than asked.
 */
export function downscaleTo(source: HTMLImageElement, targetWidth: number): Promise<Blob | null> {
  const { naturalWidth, naturalHeight } = source;
  if (!naturalWidth || !naturalHeight || targetWidth >= naturalWidth) return Promise.resolve(null);
  const draw = (from: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, width, height);
    return canvas;
  };
  let current: CanvasImageSource = source;
  let width = naturalWidth;
  while (width / 2 > targetWidth) {
    width = Math.ceil(width / 2);
    const step = draw(current, width, scaledSize(naturalWidth, naturalHeight, width).height);
    if (!step) return Promise.resolve(null);
    current = step;
  }
  const target = scaledSize(naturalWidth, naturalHeight, targetWidth);
  const out = draw(current, target.width, target.height);
  if (!out) return Promise.resolve(null);
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

interface DrawingImageProps {
  src: string;
  className?: string;
  openAir?: boolean;
}

/** A snapshot of the PC: cropped to its drawing so the logo sits just above it, and resampled to the pixels it is shown in. */
export function DrawingImage({ src, className, openAir = false }: DrawingImageProps) {
  const content = useContentBox(src);
  const ref = useRef<HTMLImageElement>(null);
  const [crisp, setCrisp] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // The tile is scaled by a transform, which a resize observer does not report, so the shown width is read again on
    // a few later frames and on resizes. It only grows: a picture a little larger than shown is still resampled well.
    const read = () => setWidth((prev) => Math.max(prev, Math.round(el.getBoundingClientRect().width)));
    read();
    const timers = [100, 400, 1200].map((ms) => window.setTimeout(read, ms));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(el);
    window.addEventListener('resize', read);
    return () => {
      timers.forEach(window.clearTimeout);
      observer?.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);

  useEffect(() => {
    setCrisp(null);
    if (!width || typeof window === 'undefined') return undefined;
    let cancelled = false;
    let url: string | null = null;
    const img = new Image();
    img.onload = () => {
      // The shown width covers the drawing (when cropped) or the whole picture.
      const side = Math.ceil((width * (window.devicePixelRatio || 1)) / (content?.widthShare ?? 1));
      downscaleTo(img, side).then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setCrisp(url);
      }).catch(() => {});
    };
    img.src = src;
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, width, content]);

  const style = content ? ({ aspectRatio: String(content.aspect), objectViewBox: content.inset } as React.CSSProperties) : undefined;
  return <img ref={ref} className={className} src={crisp ?? src} alt="" draggable={false} data-open-air={openAir ? '' : undefined} data-cropped={content ? '' : undefined} style={style} />;
}
