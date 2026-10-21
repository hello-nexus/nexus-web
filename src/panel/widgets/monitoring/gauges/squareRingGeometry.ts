import { GAUGE_FIGURE_OUTER } from './types';

/** Ring stroke weight in viewBox units, shared by Ring and Square ring. CaterpillarGauge.module.scss mirrors it; a test pins the two together. */
export const RING_STROKE = 9;

// Outer corner radius as a share of the outer side, so the silhouette reads
// rounded on the outside edge and not just along the stroke center line.
const OUTER_CORNER_SHARE = 0.13;

const CENTER = 50;
const OUTER_SIDE = 2 * GAUGE_FIGURE_OUTER;
// The stroke center line sits half a stroke inside the shared outer edge.
const HALF_SIDE = GAUGE_FIGURE_OUTER - RING_STROKE / 2;
// Center line radius: the outer radius minus half a stroke. It stays above
// half a stroke, which keeps the inner corners rounded too.
export const CORNER_RADIUS = OUTER_CORNER_SHARE * OUTER_SIDE - RING_STROKE / 2;

/** Normalized path length: dash values are percentages of the perimeter. */
export const PATH_LENGTH = 100;

export interface SquareRingShape {
  /** ViewBox size: the short side is always the shared figure size. */
  width: number;
  height: number;
  /** Rounded rectangle center line from top center, clockwise, closing at the start. */
  path: string;
  /** Closed path length in viewBox units. */
  perimeter: number;
}

const FIGURE_SIZE = 100;

/**
 * Shape for a slot of the given measured size. The short side keeps the square
 * ring's units, so stroke and corner radius look the same at any aspect; the
 * long side stretches only the straight edges. An unmeasured slot is a square.
 */
export function squareRingShape(slotWidth?: number, slotHeight?: number): SquareRingShape {
  const known = !!slotWidth && !!slotHeight && slotWidth > 0 && slotHeight > 0;
  const short = known ? Math.min(slotWidth, slotHeight) : 1;
  const width = known ? (FIGURE_SIZE * slotWidth) / short : FIGURE_SIZE;
  const height = known ? (FIGURE_SIZE * slotHeight) / short : FIGURE_SIZE;
  const inset = CENTER - HALF_SIDE;
  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;
  const r = CORNER_RADIUS;
  const mid = width / 2;
  const path = [
    `M ${mid} ${top}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${left + r}`,
    `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
    `V ${top + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
    'Z',
  ].join(' ');
  const perimeter = 2 * (right - left - 2 * r) + 2 * (bottom - top - 2 * r) + 2 * Math.PI * r;
  return { width, height, path, perimeter };
}

/** Dash pattern that draws the first `percent` of the path. */
export function progressDash(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped} ${PATH_LENGTH - clamped}`;
}
