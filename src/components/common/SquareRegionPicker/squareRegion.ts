// Geometry of a square region on a display. All values are normalized: x and y are the
// left and top edge as a fraction of the display width and height, and size is the edge as
// a fraction of the display's shorter side. Size 0 means the largest centered square.

export interface SquareRegion {
  x: number;
  y: number;
  size: number;
}

export const CENTERED_REGION: SquareRegion = { x: 0, y: 0, size: 0 };

export const MIN_REGION_SIZE = 0.1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Width and height of the square as fractions of the display's width and height. */
export function regionExtent(size: number, aspect: number): { w: number; h: number } {
  const edge = size <= 0 ? 1 : clamp(size, MIN_REGION_SIZE, 1);
  return aspect >= 1 ? { w: edge / aspect, h: edge } : { w: edge, h: edge * aspect };
}

/** The square as it is drawn: a zero size becomes the largest centered square. */
export function resolveRegion(region: SquareRegion, aspect: number): Required<SquareRegion> & { w: number; h: number } {
  const size = region.size <= 0 ? 1 : clamp(region.size, MIN_REGION_SIZE, 1);
  const { w, h } = regionExtent(size, aspect);
  if (region.size <= 0) return { x: (1 - w) / 2, y: (1 - h) / 2, size: 0, w, h };
  return { x: clamp(region.x, 0, 1 - w), y: clamp(region.y, 0, 1 - h), size, w, h };
}

/** Moves the square by a fraction of the display, keeping it on the display. */
export function moveRegion(region: SquareRegion, aspect: number, dx: number, dy: number): SquareRegion {
  const r = resolveRegion(region, aspect);
  const size = region.size <= 0 ? 1 : r.size;
  return { x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h), size };
}

/** Resizes around the square's center, keeping it on the display. */
export function resizeRegion(region: SquareRegion, aspect: number, size: number): SquareRegion {
  const r = resolveRegion(region, aspect);
  const next = clamp(size, MIN_REGION_SIZE, 1);
  const { w, h } = regionExtent(next, aspect);
  return {
    x: clamp(r.x + r.w / 2 - w / 2, 0, 1 - w),
    y: clamp(r.y + r.h / 2 - h / 2, 0, 1 - h),
    size: next,
  };
}

/** The region as the service takes it: nothing but a size of zero when it is the default. */
export function isCentered(region: SquareRegion): boolean {
  return region.size <= 0;
}
