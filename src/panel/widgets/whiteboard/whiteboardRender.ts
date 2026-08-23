// Canvas painting. The ink canvas is kept fully TRANSPARENT and the board
// background is painted behind it (CSS on screen, a composite pass on export).
// That is what lets the eraser be a real eraser - `destination-out` removes
// ink and reveals whatever is behind, on every background including
// transparent - instead of the old build's trick of drawing over ink in the
// background colour, which leaves visible smears the moment the background
// changes.

import { midpoint } from './whiteboardGeometry';
import type { Point, Stroke, ViewTransform, WhiteboardBackground } from './whiteboardTypes';

export const BACKGROUND_CSS: Record<WhiteboardBackground, string> = {
  dark: '#101014',
  light: '#f5f5f7',
  transparent: 'transparent',
};

/** Fill used when a board is flattened to an image; `transparent` stays transparent in the PNG. */
export const BACKGROUND_EXPORT: Record<WhiteboardBackground, string | null> = {
  dark: '#101014',
  light: '#f5f5f7',
  transparent: null,
};

/**
 * Traces a stroke as quadratic curves through the midpoints of consecutive
 * captured points, which is what turns a polyline of pointer samples into a
 * line that reads as hand-drawn. Both prior implementations used raw `lineTo`
 * and visibly faceted on fast strokes.
 */
export function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[], view: ViewTransform): void {
  const toScreen = (p: Point) => ({ x: p.x * view.scale + view.panX, y: p.y * view.scale + view.panY });

  ctx.beginPath();
  if (points.length === 1) {
    // A tap is a dot. Zero-length paths draw nothing even with a round cap, so
    // this has to be an explicit arc.
    const p = toScreen(points[0]);
    ctx.arc(p.x, p.y, Math.max(ctx.lineWidth / 2, 0.25), 0, Math.PI * 2);
    return;
  }

  const first = toScreen(points[0]);
  ctx.moveTo(first.x, first.y);
  if (points.length === 2) {
    const second = toScreen(points[1]);
    ctx.lineTo(second.x, second.y);
    return;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const control = toScreen(points[i]);
    const end = midpoint(control, toScreen(points[i + 1]));
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  }
  const last = toScreen(points[points.length - 1]);
  ctx.lineTo(last.x, last.y);
}

/** Paints one stroke at the given view. A single-point pen stroke fills; everything else strokes. */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, view: ViewTransform): void {
  if (stroke.points.length === 0) return;

  // Sub-pixel strokes would otherwise disappear entirely when zoomed out.
  const screenWidth = Math.max(stroke.width * view.scale, 0.5);

  ctx.save();
  ctx.lineWidth = screenWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  tracePath(ctx, stroke.points, view);
  if (stroke.points.length === 1) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  view: ViewTransform,
): void {
  for (const stroke of strokes) paintStroke(ctx, stroke, view);
}

/**
 * Sizes a canvas to `cssWidth` x `cssHeight` at the device pixel ratio and
 * leaves the context scaled so every subsequent draw call is in CSS pixels.
 * Returns false when the size is degenerate (a cell mid-layout), so callers
 * skip the paint instead of rendering into a 0x0 buffer.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): CanvasRenderingContext2D | null {
  if (cssWidth <= 0 || cssHeight <= 0) return null;
  const w = Math.round(cssWidth * dpr);
  const h = Math.round(cssHeight * dpr);
  // Assigning width/height clears the canvas, so only touch it on a real change.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  return ctx;
}

/**
 * Flattens a board to a PNG data URL at `scale` device pixels per canvas unit.
 * Ink is composited onto the background rather than drawn over it, so eraser
 * strokes cut through ink without also cutting through the background fill.
 */
export function rasterizeBoard(
  strokes: readonly Stroke[],
  view: ViewTransform,
  width: number,
  height: number,
  background: WhiteboardBackground,
  scale = 2,
): string | null {
  if (width <= 0 || height <= 0) return null;

  const ink = document.createElement('canvas');
  ink.width = Math.round(width * scale);
  ink.height = Math.round(height * scale);
  const inkCtx = ink.getContext('2d');
  if (!inkCtx) return null;
  inkCtx.setTransform(scale, 0, 0, scale, 0, 0);
  paintStrokes(inkCtx, strokes, view);

  const out = document.createElement('canvas');
  out.width = ink.width;
  out.height = ink.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  const fill = BACKGROUND_EXPORT[background];
  if (fill) {
    outCtx.fillStyle = fill;
    outCtx.fillRect(0, 0, out.width, out.height);
  }
  outCtx.drawImage(ink, 0, 0);
  return out.toDataURL('image/png');
}
