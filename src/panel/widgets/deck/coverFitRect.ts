/** Scale + center-offset an image so it cover-fits a `size` square, cropping the overflowing dimension. */
export function coverFitRect(imgWidth: number, imgHeight: number, size: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(size / imgWidth, size / imgHeight);
  const w = imgWidth * scale;
  const h = imgHeight * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}
