/** A device frame on the unit canvas, as the 2D editor draws it. */
export interface FrameGeometry {
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  /** Degrees, clockwise on screen. */
  canvasRotation?: number;
}

/** Canvas size in the units the frames are placed in. */
export const DOT_CANVAS_W = 1000;
export const DOT_CANVAS_H = 600;

// A dark LED still has to read as a dot; the 3D scene floors its dots the same way.
const MIN_CHANNEL = 20;

/**
 * Where a point inside a frame (0..1 on each axis, before the frame's turn)
 * lands on the canvas, as 0..1 fractions. The frame turns about its centre.
 */
export function framePointToCanvas(frame: FrameGeometry, fx: number, fy: number): { x: number; y: number } {
  const cx = frame.canvasX + frame.canvasW / 2;
  const cy = frame.canvasY + frame.canvasH / 2;
  const dx = (fx - 0.5) * frame.canvasW;
  const dy = (fy - 0.5) * frame.canvasH;
  const rad = ((frame.canvasRotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: (cx + dx * cos - dy * sin) / DOT_CANVAS_W,
    y: (cy + dx * sin + dy * cos) / DOT_CANVAS_H,
  };
}

/**
 * The colour of the output-frame pixel under a canvas point (0..1 fractions), as
 * a CSS colour, or null when there is no frame to read. The floor of the pixel
 * position matches the engine's own sampling and the 3D scene's dots.
 */
export function colorAtCanvasPoint(
  pixels: Uint8Array | null,
  w: number,
  h: number,
  point: { x: number; y: number },
): string | null {
  if (!pixels || w === 0 || h === 0) return null;
  const px = Math.min(w - 1, Math.max(0, Math.floor(point.x * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor(point.y * h)));
  const s = (py * w + px) * 3;
  const r = Math.max(pixels[s], MIN_CHANNEL);
  const g = Math.max(pixels[s + 1], MIN_CHANNEL);
  const b = Math.max(pixels[s + 2], MIN_CHANNEL);
  return `rgb(${r}, ${g}, ${b})`;
}

/** The colour under a point of a device frame (0..1 before the frame's turn). */
export function ledDotColor(
  pixels: Uint8Array | null,
  w: number,
  h: number,
  frame: FrameGeometry,
  fx: number,
  fy: number,
): string | null {
  if (!pixels || w === 0 || h === 0) return null;
  return colorAtCanvasPoint(pixels, w, h, framePointToCanvas(frame, fx, fy));
}
