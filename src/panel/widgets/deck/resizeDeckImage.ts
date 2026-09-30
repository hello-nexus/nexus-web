import { normalizeRotate, type NormalizedCrop } from '../../../components/common/MediaCropper/mediaCrop';

// Matches the key art Elgato profiles ship, so uploaded and Elgato-imported
// art share one target size and both downsample to any physical key size.
export const DECK_IMAGE_SIZE = 144;

export interface DeckImageRects {
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
}

/**
 * Rects mapping an `ow` x `oh` oriented image onto a `size` square: the crop filling it, or with `fit` the whole image
 * contain-fit on transparency. A non-square crop (MediaCropper's whole frame, confirmed before decode) narrows to its centre.
 */
export function deckImageRects(crop: NormalizedCrop, fit: boolean, ow: number, oh: number, size: number): DeckImageRects {
  if (fit) {
    const scale = Math.min(size / ow, size / oh);
    const dw = ow * scale;
    const dh = oh * scale;
    return { sx: 0, sy: 0, sw: ow, sh: oh, dx: (size - dw) / 2, dy: (size - dh) / 2, dw, dh };
  }
  const cw = crop.w * ow;
  const ch = crop.h * oh;
  const side = Math.min(cw, ch);
  return { sx: crop.x * ow + (cw - side) / 2, sy: crop.y * oh + (ch - side) / 2, sw: side, sh: side, dx: 0, dy: 0, dw: size, dh: size };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/**
 * Renders a MediaCropper result (orientation, then crop or `fit`) to a square DECK_IMAGE_SIZE PNG in one transform: a
 * full-resolution intermediate canvas of a phone photo can exceed a panel WebView's canvas limit and draw blank silently.
 */
export async function resizeDeckImage(src: string, crop: NormalizedCrop, fit: boolean): Promise<Blob> {
  const img = await loadImage(src);
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) throw new Error('image decode failed');
  const rotate = normalizeRotate(crop.rotate);
  const swap = rotate === 90 || rotate === 270;
  const ow = swap ? nh : nw;
  const oh = swap ? nw : nh;

  const canvas = document.createElement('canvas');
  canvas.width = DECK_IMAGE_SIZE;
  canvas.height = DECK_IMAGE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  const r = deckImageRects(crop, fit, ow, oh, DECK_IMAGE_SIZE);
  // Source rect to destination, then orient about the image centre: mirror in source space, then rotate clockwise.
  ctx.translate(r.dx, r.dy);
  ctx.scale(r.dw / r.sw, r.dh / r.sh);
  ctx.translate(-r.sx + ow / 2, -r.sy + oh / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(crop.mirror ? -1 : 1, 1);
  ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('canvas encode failed'))), 'image/png');
  });
}
