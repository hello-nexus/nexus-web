import type { KeyReactionBackground, KeyReactionColorMode, KeyReactionEffect } from '../../../api/keyReactive';

/** Gallery order: the keyboard's onboard effects first, then the engine's own. */
export const KEY_REACTION_EFFECTS: readonly KeyReactionEffect[] = [
  'fade', 'rowSweep', 'columnSweep', 'ripple',
  'crosshair', 'starburst', 'heatmap', 'sparks', 'lightning', 'trace',
];

export const KEY_REACTION_COLOR_MODES: readonly KeyReactionColorMode[] = ['custom', 'rainbow', 'random'];
export const KEY_REACTION_BACKGROUNDS: readonly KeyReactionBackground[] = ['effect', 'dim', 'dark', 'reveal'];

export const SPEED_RANGE = { min: 0.25, max: 3 } as const;
export const SIZE_RANGE = { min: 0.5, max: 3 } as const;
export const MULTIPLIER_STEP = 0.05;

/** Swatches offered next to the custom picker. */
export const KEY_REACTION_PRESETS: readonly string[] = [
  '#ff2d55', '#ff7a1a', '#ffd60a', '#32d74b', '#00e5c8',
  '#0a84ff', '#5e5ce6', '#bf5af2', '#ff6fb5', '#ffffff',
];

/** Slider readout such as "1.5x"; whole numbers drop the fraction. */
export function formatMultiplier(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2))}x`;
}

/** Snaps a slider value to the step grid so float drift never reaches the wire. */
export function snapMultiplier(v: number): number {
  return Math.round(Math.round(v / MULTIPLIER_STEP) * MULTIPLIER_STEP * 100) / 100;
}

/** The card's LED bytes out of a stream frame's device sections, or null when
 *  the section is missing or too short for the board's LED count. */
export function liveLedBytes(
  devices: ReadonlyMap<number, Uint8Array> | undefined,
  frameIndex: number,
  ledCount: number,
): Uint8Array | null {
  const bytes = devices?.get(frameIndex);
  return bytes && ledCount > 0 && bytes.length >= ledCount * 3 ? bytes : null;
}

/** Per-channel max, so a black LED still reads as the unlit base. */
export function lift(channel: number, floor: number): number {
  return channel > floor ? channel : floor;
}
