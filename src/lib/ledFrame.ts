// Paint a packed RGB LED-output frame (stride 3) onto a 2D canvas, sizing the
// canvas to the frame. Shared by the device-canvas background and the immersive
// lighting preview so the pixel unpack lives in one place. A null frame clears
// to black.
export function paintLedFrame(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array | null,
  w: number,
  h: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!pixels || w === 0 || h === 0) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const s = i * 3, o = i * 4;
    d[o] = pixels[s]; d[o + 1] = pixels[s + 1]; d[o + 2] = pixels[s + 2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
