/** Absorption per mm of a fully hot column of air: sets how opaque the hottest air gets over a case's depth. */
export const VOLUME_ABSORB_PER_MM = 0.006;
/** Mm from a case wall over which the volume fades in, so the shell stays readable. */
export const VOLUME_WALL_FADE_MM = 30;
/** Samples along each ray. */
export const VOLUME_STEPS = 80;
/** The volume renders at this share of the view size per axis and is upsampled. */
export const VOLUME_SCALE = 0.5;
/** Accumulated opacity at which a ray stops. */
export const VOLUME_EARLY_EXIT = 0.95;

/** Density of the air at a rise over room temperature, 0 to 1: nothing at room temperature, rising smoothly to the hottest air the span covers. Mirrors the shader. */
export function volumeDensity(riseK: number, spanK: number): number {
  const h = Math.min(1, Math.max(0, riseK / spanK));
  return h * h * (3 - 2 * h);
}

/** Opacity one ray step of `stepMm` adds in air of that density. Mirrors the shader. */
export const stepOpacity = (density: number, stepMm: number): number => 1 - Math.exp(-density * VOLUME_ABSORB_PER_MM * stepMm);
