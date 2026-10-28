/** Streamed families whose glass is 1-bit; the preview applies the service's luma cutoff. */
const MONO_FAMILIES: ReadonlySet<string> = new Set(['steelseries-apex-oled']);

/** Wide glass that is too small to stack under the options: the preview stays in the right column. */
const SIDE_PREVIEW_FAMILIES: ReadonlySet<string> = new Set(['steelseries-apex-oled']);

/** Mirrors ApexOledMono.LumaThreshold on the service. */
export const MONO_LUMA_THRESHOLD = 96;

/** Rec.601 weights as the service scales them to a power of two. */
export const MONO_LUMA_WEIGHTS = { r: 77 / 256, g: 150 / 256, b: 29 / 256 } as const;

/** Slope steep enough that the filter output is 0 or 1 at every 8-bit luma. */
export const MONO_STEP_SLOPE = 1000;

/** Intercept placing the step midway between the last unlit and first lit luma. */
export const MONO_STEP_INTERCEPT = -MONO_STEP_SLOPE * (MONO_LUMA_THRESHOLD - 0.5) / 255;

export const MONO_FILTER_ID = 'nexus-mono-preview';

export function isMonoFamily(family: string | undefined): boolean {
  return !!family && MONO_FAMILIES.has(family);
}

export function keepsSidePreview(family: string | undefined): boolean {
  return !!family && SIDE_PREVIEW_FAMILIES.has(family);
}
