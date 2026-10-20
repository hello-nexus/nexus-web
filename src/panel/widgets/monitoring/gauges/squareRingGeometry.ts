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

/** Closed path length in viewBox units. */
export const SQUARE_PERIMETER = 8 * (HALF_SIDE - CORNER_RADIUS) + 2 * Math.PI * CORNER_RADIUS;

/** Normalized path length: dash values are percentages of the perimeter. */
export const PATH_LENGTH = 100;

/** Rounded square center line from top centre, clockwise, closing at the start. */
export const SQUARE_PATH = (() => {
  const r = CORNER_RADIUS;
  const lo = CENTER - HALF_SIDE;
  const hi = CENTER + HALF_SIDE;
  return [
    `M ${CENTER} ${lo}`,
    `H ${hi - r}`,
    `A ${r} ${r} 0 0 1 ${hi} ${lo + r}`,
    `V ${hi - r}`,
    `A ${r} ${r} 0 0 1 ${hi - r} ${hi}`,
    `H ${lo + r}`,
    `A ${r} ${r} 0 0 1 ${lo} ${hi - r}`,
    `V ${lo + r}`,
    `A ${r} ${r} 0 0 1 ${lo + r} ${lo}`,
    'Z',
  ].join(' ');
})();

/** Dash pattern that draws the first `percent` of the path. */
export function progressDash(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped} ${PATH_LENGTH - clamped}`;
}
