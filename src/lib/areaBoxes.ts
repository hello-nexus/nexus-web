import { CANVAS_UNITS_H, CANVAS_UNITS_W, sampleBoxLinear, type LedSample, type SampleDevice, type SampleFrame } from './ledSampling';
import { sliceStackSlot, type StackSlot } from './stackSlots';

export interface AreaBoxRect {
  index: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Unpacks the flat 4-per-LED box list. Zero-area entries (disabled LEDs) are dropped; index stays the card-local LED index. */
export function areaBoxRects(flat: number[]): AreaBoxRect[] {
  const out: AreaBoxRect[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const [u0, v0, u1, v1] = [flat[i], flat[i + 1], flat[i + 2], flat[i + 3]];
    if (u1 <= u0 || v1 <= v0) continue;
    out.push({ index: i / 4, u0, v0, u1, v1 });
  }
  return out;
}

/**
 * Where one box reads on the canvas: its center turned about the frame
 * center, with the half extents of the turned box's bounds. A stack slot is
 * cut from the unturned rect first, as in ledSample.
 */
export function areaBoxSample(
  device: SampleDevice, box: AreaBoxRect, canvasW: number, canvasH: number, slot?: StackSlot | null, fullFrame = false,
): LedSample {
  // A sweep read maps the boxes onto the whole canvas, unturned and unsliced.
  if (fullFrame) {
    device = { canvasX: 0, canvasY: 0, canvasW: CANVAS_UNITS_W, canvasH: CANVAS_UNITS_H, canvasRotation: 0 };
    slot = null;
  }
  const kx = canvasW / CANVAS_UNITS_W;
  const ky = canvasH / CANVAS_UNITS_H;
  const frameCx = device.canvasX + device.canvasW * 0.5;
  const frameCy = device.canvasY + device.canvasH * 0.5;
  const rect = slot
    ? sliceStackSlot({ x: device.canvasX, y: device.canvasY, w: device.canvasW, h: device.canvasH }, slot)
    : { x: device.canvasX, y: device.canvasY, w: device.canvasW, h: device.canvasH };
  const rad = (((device.canvasRotation % 360) + 360) % 360) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = rect.x + ((box.u0 + box.u1) / 2) * rect.w - frameCx;
  const ly = rect.y + ((box.v0 + box.v1) / 2) * rect.h - frameCy;
  const hw = ((box.u1 - box.u0) / 2) * rect.w;
  const hh = ((box.v1 - box.v0) / 2) * rect.h;
  return {
    sx: (frameCx + lx * cos - ly * sin) * kx,
    sy: (frameCy + lx * sin + ly * cos) * ky,
    halfW: (hw * Math.abs(cos) + hh * Math.abs(sin)) * kx,
    halfH: (hw * Math.abs(sin) + hh * Math.abs(cos)) * ky,
  };
}

/** The live color of one Area-sampling LED box from the current frame. */
export function sampleAreaBox(
  frame: SampleFrame, device: SampleDevice, box: AreaBoxRect, slot?: StackSlot | null, fullFrame = false,
): [number, number, number] {
  return sampleBoxLinear(frame, areaBoxSample(device, box, frame.w, frame.h, slot, fullFrame));
}

const rectCache = new WeakMap<number[], Map<number, AreaBoxRect>>();

/** The boxes by card-local LED index, built once per box array. */
export function areaBoxesByLed(flat: number[]): Map<number, AreaBoxRect> {
  let m = rectCache.get(flat);
  if (!m) {
    m = new Map(areaBoxRects(flat).map(b => [b.index, b]));
    rectCache.set(flat, m);
  }
  return m;
}
