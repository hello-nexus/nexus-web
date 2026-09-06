// Crop-rectangle + orientation model shared by the MediaCropper UI and every
// import consumer. The service applies orientation before crop (see
// nexus-service CropRect.OrientationFilter), so the crop rect is always
// normalized against the ORIENTED frame, and the wire string carries the
// orientation alongside it.

export interface NormalizedCrop {
  /** All 0..1 of the oriented source. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise rotation in degrees: 0 | 90 | 180 | 270. Absent = 0. */
  rotate?: number;
  /** Horizontal mirror applied in source space (before rotate). Absent = false. */
  mirror?: boolean;
}

export interface Orientation {
  /** 0 | 90 | 180 | 270, clockwise. */
  rotate: number;
  mirror: boolean;
}

/** Snaps any value to the nearest legal quarter turn. */
export function normalizeRotate(r: number | undefined): number {
  return ((((Math.round((r ?? 0) / 90) * 90) % 360) + 360) % 360);
}

// Orientation is the dihedral group D4: a mirror (in source space) then k
// quarter-turns CW. Each button composes a new operation in SCREEN space, so
// the controls feel direct whatever the current state. Derivations use the
// identity FlipH·Rot(t) = Rot(-t)·FlipH.

export function rotateCw(o: Orientation): Orientation {
  return { rotate: (o.rotate + 90) % 360, mirror: o.mirror };
}

export function rotateCcw(o: Orientation): Orientation {
  return { rotate: (o.rotate + 270) % 360, mirror: o.mirror };
}

export function flipHorizontal(o: Orientation): Orientation {
  const k = normalizeRotate(o.rotate) / 90;
  return { rotate: ((4 - k) % 4) * 90, mirror: !o.mirror };
}

export function flipVertical(o: Orientation): Orientation {
  const k = normalizeRotate(o.rotate) / 90;
  return { rotate: ((6 - k) % 4) * 90, mirror: !o.mirror };
}

/**
 * Serializes to "x,y,w,h" (identity, backwards-compatible with the pre-rotation
 * wire form) or "x,y,w,h,rotate,mirror" when an orientation is present.
 */
export function serializeCrop(crop: NormalizedCrop): string {
  const base = `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`;
  const rotate = normalizeRotate(crop.rotate);
  const mirror = crop.mirror ? 1 : 0;
  return rotate === 0 && mirror === 0 ? base : `${base},${rotate},${mirror}`;
}

/**
 * Normalized w/h ratio that yields the target pixel aspect for an oriented
 * source of ow x oh: (w*ow)/(h*oh) = aspect  =>  w/h = aspect*oh/ow.
 */
export function normAspectFor(aspect: number, ow: number, oh: number): number {
  return ow && oh ? aspect * oh / ow : aspect;
}

/** The largest centred crop of an ow x oh oriented source at `aspect`. */
export function centerCropForAspect(aspect: number, ow: number, oh: number): NormalizedCrop {
  const r = normAspectFor(aspect, ow, oh);
  const w = r <= 1 ? r : 1;
  const h = r <= 1 ? 1 : 1 / r;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
