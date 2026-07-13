// Cover-fit resize/crop for a user-supplied deck key icon: matches the
// 144x144 key art Elgato profiles ship, so uploaded and Elgato-imported art
// share one target size and both downsample cleanly to any physical key.
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
      const scale = Math.max(DECK_IMAGE_SIZE / img.width, DECK_IMAGE_SIZE / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (DECK_IMAGE_SIZE - w) / 2, (DECK_IMAGE_SIZE - h) / 2, w, h);
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
