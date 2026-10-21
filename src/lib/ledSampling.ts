import { sliceStackSlot, type StackSlot } from './stackSlots';

/**
 * Turns the effect canvas into one LED's color the way the service does.
 * Mirrors LightingEngine.SampleDevicesCore (linear strip path) and
 * SampleLedSpot / SampleLedBox in nexus-service
 * (src/Lighting/Engine/LightingEngine.cs). Change them together.
 */

/** The canvas the layout rects are expressed in. */
export const CANVAS_UNITS_W = 1000;
export const CANVAS_UNITS_H = 600;

/** Side of the sampling spot at an LED, as a fraction of the canvas width. */
export const SPOT_SIDE_OF_CANVAS_WIDTH = 3 / 160;

/** Thickness of the slice a full-frame strip reads, as a fraction of canvas height. */
export const FULL_FRAME_STRIP_BREADTH = 0.08;

export interface SampleDevice {
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  canvasRotation: number;
}

export interface SampleFrame {
  pixels: Uint8Array;
  w: number;
  h: number;
}

/** An LED's read: its position on the canvas in pixels and the half extents of its own cell. */
export interface LedSample {
  sx: number;
  sy: number;
  halfW: number;
  halfH: number;
}

/**
 * Where LED `index` of `ledCount` reads. The LEDs walk the unturned rect's
 * width along its centerline, first at the left (a lone LED sits at the center);
 * the frame turns about its own center, a stack slot is cut from the unturned
 * rect before that and turns with the frame. `fullFrame` ignores the layout:
 * the rect is the whole canvas, unturned, and the cell is a thin slice of it.
 */
export function ledSample(
  device: SampleDevice, index: number, ledCount: number,
  canvasW: number, canvasH: number,
  opts: { fullFrame?: boolean; slot?: StackSlot | null } = {},
): LedSample {
  const fullFrame = !!opts.fullFrame;
  const kx = canvasW / CANVAS_UNITS_W;
  const ky = canvasH / CANVAS_UNITS_H;
  let rect = fullFrame
    ? { x: 0, y: 0, w: CANVAS_UNITS_W, h: CANVAS_UNITS_H }
    : { x: device.canvasX, y: device.canvasY, w: device.canvasW, h: device.canvasH };
  const frameCx = rect.x + rect.w * 0.5;
  const frameCy = rect.y + rect.h * 0.5;
  const rad = fullFrame ? 0 : (((device.canvasRotation % 360) + 360) % 360) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  if (opts.slot && !fullFrame) rect = sliceStackSlot(rect, opts.slot);

  const pitchHalf = Math.max(1 / kx, rect.w / ledCount) * 0.5;
  const breadth = fullFrame ? rect.h * FULL_FRAME_STRIP_BREADTH : rect.h;
  const breadthHalf = Math.max(1 / ky, breadth) * 0.5;
  const absCos = Math.abs(cos);
  const absSin = Math.abs(sin);
  const midY = rect.y + rect.h * 0.5 - frameCy;
  const t = ledCount > 1 ? index / (ledCount - 1) - 0.5 : 0;
  const lx = rect.x + rect.w * 0.5 + t * rect.w - frameCx;
  return {
    sx: (frameCx + lx * cos - midY * sin) * kx,
    sy: (frameCy + lx * sin + midY * cos) * ky,
    halfW: (pitchHalf * absCos + breadthHalf * absSin) * kx,
    halfH: (pitchHalf * absSin + breadthHalf * absCos) * ky,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Plain mean of canvas pixels ix0..ix1 x iy0..iy1 inclusive, black included. */
function meanRect(f: SampleFrame, ix0: number, iy0: number, ix1: number, iy1: number): [number, number, number] {
  let n = 0, r = 0, g = 0, b = 0;
  for (let y = iy0; y <= iy1; y++) {
    for (let x = ix0; x <= ix1; x++) {
      const s = (y * f.w + x) * 3;
      r += f.pixels[s]; g += f.pixels[s + 1]; b += f.pixels[s + 2];
      n++;
    }
  }
  return n === 0 ? [0, 0, 0] : [Math.floor(r / n), Math.floor(g / n), Math.floor(b / n)];
}

/**
 * The color of one LED: the plain mean of a small spot of pixels centered on
 * the pixel holding its position, shrunk to the LED's own cell when that is
 * smaller, clamped at the canvas edges.
 */
export function sampleSpot(f: SampleFrame, s: LedSample): [number, number, number] {
  const spotHalf = Math.max(0.5, f.w * SPOT_SIDE_OF_CANVAS_WIDTH * 0.5);
  const hx = Math.min(s.halfW, spotHalf);
  const hy = Math.min(s.halfH, spotHalf);
  const cx = Math.floor(s.sx) + 0.5;
  const cy = Math.floor(s.sy) + 0.5;
  const ix0 = clamp(Math.floor(cx - hx), 0, f.w - 1);
  const iy0 = clamp(Math.floor(cy - hy), 0, f.h - 1);
  const ix1 = clamp(Math.ceil(cx + hx) - 1, ix0, f.w - 1);
  const iy1 = clamp(Math.ceil(cy + hy) - 1, iy0, f.h - 1);
  return meanRect(f, ix0, iy0, ix1, iy1);
}

/** The whole cell's plain mean: the read under full-frame sampling, where the cell is a slice of the pattern. */
export function sampleBox(f: SampleFrame, s: LedSample): [number, number, number] {
  const ix0 = clamp(Math.floor(s.sx - s.halfW), 0, f.w - 1);
  const iy0 = clamp(Math.floor(s.sy - s.halfH), 0, f.h - 1);
  const ix1 = clamp(Math.ceil(s.sx + s.halfW) - 1, ix0, f.w - 1);
  const iy1 = clamp(Math.ceil(s.sy + s.halfH) - 1, iy0, f.h - 1);
  return meanRect(f, ix0, iy0, ix1, iy1);
}
