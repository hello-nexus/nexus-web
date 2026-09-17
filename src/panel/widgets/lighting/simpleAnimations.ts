import type { EffectState } from '../../../types/lighting';

/**
 * Simple mode's animation set: seven sweeps offered under the colour palette.
 *
 * They are deliberately NOT in EFFECTS - the advanced page's grid, its drawer
 * and every template surface enumerate that list, and these carry no controls
 * to show there. Mirrors ShaderLibrary.SweepEffectKeys in nexus-service, which
 * owns the shaders and switches the engine to whole-canvas sampling while one
 * of them runs, so every device shows the entire pattern rather than the slice
 * its layout frame covers.
 */
export const SIMPLE_ANIMATION_KEYS = [
  'sweeprainbow', 'sweepbars', 'sweepbrush', 'sweepcomet',
  'sweepribbon', 'sweepink', 'sweepneon',
] as const;

export function isSimpleAnimation(key: string): boolean {
  return (SIMPLE_ANIMATION_KEYS as readonly string[]).includes(key);
}

/** 1-based position in the row, which is all the naming these tiles get. */
export function simpleAnimationIndex(key: string): number {
  return (SIMPLE_ANIMATION_KEYS as readonly string[]).indexOf(key) + 1;
}

/**
 * The look a sweep runs with. Every shader in the set travels one way (+x), so
 * direction is the speed sign - the engine reads a negative speed as time
 * running backwards, which turns the sweep around on every device at once.
 * Everything else is left at the base look: simple mode exposes no controls.
 */
export function simpleAnimationState(reversed: boolean): EffectState {
  return {
    speed: reversed ? -50 : 50,
    intensity: 1,
    hue: 0,
    colorize: 0,
    saturation: 1,
    contrast: 1,
    params: {},
  };
}
