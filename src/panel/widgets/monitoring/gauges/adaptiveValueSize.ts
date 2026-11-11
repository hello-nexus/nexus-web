// One sizing rule for every gauge design's value line. The font size comes
// from the slot size and a reserved reading for the metric's unit, never from
// the live value, so the size holds still while the value ticks.

export const VALUE_MAX_PX = 72;
// Share of the slot width the value line may take.
export const VALUE_WIDTH_FRACTION = 0.9;
// Share of the slot height the line may take, leaving room for the caption.
export const VALUE_HEIGHT_FRACTION = 0.4;

// Widest plausible digits per unit, shown as 8 (a widest-class digit). Keyed
// on the unit alone so a reading crossing a magnitude boundary cannot move it.
const WIDEST_DIGITS: Record<string, string> = {
  '%': '100',
  '°C': '100',
  '°F': '212',
  MHz: '8,888',
  GHz: '8.88',
  RPM: '8888',
  W: '888',
  V: '88.88',
  MB: '88888',
  GB: '888.8',
  FPS: '888',
};
// A unit with no entry reserves this many digits.
const UNKNOWN_UNIT_DIGITS = '8888';

/** The reading the font size is fitted to for this unit. */
export function widestReading(unit: string): string {
  return WIDEST_DIGITS[unit] ?? UNKNOWN_UNIT_DIGITS;
}

/**
 * Largest font size whose reserved reading fits, never below `floorPx` (the
 * design's own size) and never above the max. `readingWidthEm` is that
 * reading's width at a 1px font size.
 *
 * A design that draws its value inside a ring passes `innerFraction`: the
 * share of the slot's short side the reading may span. That bound only caps
 * growth: when today's size already exceeds it, today's size holds.
 * Undefined until measurable.
 */
export function fitValueFontSize(
  slotWidthPx: number,
  slotHeightPx: number,
  readingWidthEm: number,
  floorPx: number,
  innerFraction?: number,
): number | undefined {
  if (!(slotWidthPx > 0) || !(readingWidthEm > 0)) return undefined;
  if (innerFraction !== undefined) {
    const short = slotHeightPx > 0 ? Math.min(slotWidthPx, slotHeightPx) : slotWidthPx;
    const inner = Math.floor((short * innerFraction) / readingWidthEm);
    return Math.max(floorPx, Math.min(VALUE_MAX_PX, inner));
  }
  const byWidth = (slotWidthPx * VALUE_WIDTH_FRACTION) / readingWidthEm;
  const byHeight = slotHeightPx > 0 ? slotHeightPx * VALUE_HEIGHT_FRACTION : Infinity;
  const fit = Math.min(VALUE_MAX_PX, byWidth, byHeight);
  return Math.max(floorPx, Math.floor(fit));
}
