/** Blade tip radius as a share of the fan's frame size. */
export const FAN_TIP_FRACTION = 0.47;
/** Hub radius as a share of the tip radius. */
export const FAN_HUB_RATIO = 0.38;

/** Tip and hub radii, mm, of a fan whose square frame is `frameMm` across. The air moves through the ring between them. */
export function fanRadii(frameMm: number): { tip: number; hub: number } {
  const tip = frameMm * FAN_TIP_FRACTION;
  return { tip, hub: tip * FAN_HUB_RATIO };
}
