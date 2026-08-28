import { hexToHsv, hsvToHex } from '../../../../lib/settings';

/**
 * The Static canvas is one continuous colour field: X is hue, Y runs white at
 * the top, through the pure hue across the middle, to black at the bottom.
 * Every point is a fully saturated HSL colour, which is what lets a device's
 * stored hex be placed back onto the field analytically - there is no search.
 *
 * The CSS that paints the field (a 7-stop hue ramp under a white-to-clear and a
 * clear-to-black overlay) composites to exactly this function; the two must be
 * changed together or a dot stops sitting on its own colour.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function pickerHexAt(x: number, y: number): string {
  const l = 1 - clamp01(y);
  // HSL(h, 100%, l) expressed in the HSV the rest of the lighting code speaks.
  const v = l <= 0.5 ? 2 * l : 1;
  const s = l <= 0.5 ? 1 : 2 * (1 - l);
  return hsvToHex(clamp01(x) * 360, s * 100, v * 100);
}

export interface PickerPoint {
  x: number;
  y: number;
  /** The colour is muted, so the fully saturated field only approximates it. */
  offField: boolean;
}

export function pickerPointFor(hex: string): PickerPoint {
  const { h, s, v } = hexToHsv(hex);
  const sN = s / 100;
  const vN = v / 100;
  const l = vN * (1 - sN / 2);
  const denom = Math.min(l, 1 - l);
  // Pure black and pure white are the field's own top and bottom edges, not
  // off-field colours, and they are exactly where denom collapses to 0.
  const sl = denom <= 0 ? 1 : (vN - l) / denom;
  return { x: h / 360, y: 1 - l, offField: sl < 0.92 };
}

/**
 * The segmented view samples the same field on a coarse grid - the old palette's
 * 14 hue columns. The rows are lightness stops rather than an even split of the
 * axis: the ends pull in from white and black, which an LED renders as blown out
 * and as off. The middle stops sit where an even 6-row split puts them.
 */
export const PICKER_SEGMENT_COLS = 14;
const SEGMENT_ROW_L = [0.84, 0.75, 7 / 12, 5 / 12, 0.25, 0.18];
export const PICKER_SEGMENT_ROWS = SEGMENT_ROW_L.length;

/** Snaps a point to its cell's swatch, so a segmented press lands on one. */
export function snapToSegment(x: number, y: number): { x: number; y: number } {
  const c = Math.min(PICKER_SEGMENT_COLS - 1, Math.floor(clamp01(x) * PICKER_SEGMENT_COLS));
  const r = Math.min(PICKER_SEGMENT_ROWS - 1, Math.floor(clamp01(y) * PICKER_SEGMENT_ROWS));
  return { x: (c + 0.5) / PICKER_SEGMENT_COLS, y: 1 - SEGMENT_ROW_L[r] };
}

/** Every segmented swatch, row-major. */
export const SEGMENT_SWATCHES: string[] = Array.from(
  { length: PICKER_SEGMENT_COLS * PICKER_SEGMENT_ROWS },
  (_, i) => pickerHexAt(
    ((i % PICKER_SEGMENT_COLS) + 0.5) / PICKER_SEGMENT_COLS,
    1 - SEGMENT_ROW_L[Math.floor(i / PICKER_SEGMENT_COLS)],
  ),
);

/** The field as an image, for the effect grid's picker tile. */
export const PICKER_FIELD_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" preserveAspectRatio="none" viewBox="0 0 160 100">`
  + `<defs>`
  + `<linearGradient id="h" x1="0" y1="0" x2="1" y2="0">`
  + `<stop offset="0" stop-color="#f00"/><stop offset=".1667" stop-color="#ff0"/>`
  + `<stop offset=".3333" stop-color="#0f0"/><stop offset=".5" stop-color="#0ff"/>`
  + `<stop offset=".6667" stop-color="#00f"/><stop offset=".8333" stop-color="#f0f"/>`
  + `<stop offset="1" stop-color="#f00"/></linearGradient>`
  + `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1">`
  + `<stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  + `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">`
  + `<stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000"/></linearGradient>`
  + `</defs>`
  + `<rect width="160" height="100" fill="url(#h)"/>`
  + `<rect width="160" height="100" fill="url(#w)"/>`
  + `<rect width="160" height="100" fill="url(#b)"/>`
  + `</svg>`,
)}`;

/** The segmented field as an image, for its own tile. */
export const PICKER_SEGMENTED_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PICKER_SEGMENT_COLS}" height="${PICKER_SEGMENT_ROWS}" preserveAspectRatio="none" viewBox="0 0 ${PICKER_SEGMENT_COLS} ${PICKER_SEGMENT_ROWS}">`
  + SEGMENT_SWATCHES.map((hexColor, i) => {
    const c = i % PICKER_SEGMENT_COLS;
    const r = Math.floor(i / PICKER_SEGMENT_COLS);
    return `<rect x="${c}" y="${r}" width="1" height="1" fill="${hexColor}"/>`;
  }).join('')
  + `</svg>`,
)}`;

/**
 * A pick round-trips through the service as float hue/saturation, so the hex it
 * comes back as can sit a channel step off the swatch it was taken from. Only a
 * difference wider than that means the device is really off-grid.
 */
export function sameSwatch(a: string, b: string): boolean {
  if (a.length !== 7 || b.length !== 7) return false;
  for (let i = 1; i < 7; i += 2) {
    if (Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) > 4) return false;
  }
  return true;
}
