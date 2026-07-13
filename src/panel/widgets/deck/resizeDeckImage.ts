import { coverFitRect } from './coverFitRect';

// Matches the key art Elgato profiles ship, so uploaded and Elgato-imported
// art share one target size and both downsample to any physical key size.
export const DECK_IMAGE_SIZE = 144;

/** Resize + center-crop an arbitrary image file to a square DECK_IMAGE_SIZE PNG. */
export function resizeDeckImage(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = DECK_IMAGE_SIZE;
      canvas.height = DECK_IMAGE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas 2d context unavailable')); return; }
      const { x, y, w, h } = coverFitRect(img.width, img.height, DECK_IMAGE_SIZE);
      ctx.drawImage(img, x, y, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('canvas encode failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image decode failed'));
    };
    img.src = objectUrl;
  });
}
