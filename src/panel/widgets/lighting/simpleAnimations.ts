import type { EffectState } from '../../../types/lighting';

/**
 * Simple mode's animation set: seven tiles offered under the colour palette.
 *
 * They are deliberately NOT in EFFECTS - the advanced page's grid, its drawer
 * and every template surface enumerate that list, and these carry no controls
 * to show there. sweepbreathing renders the advanced Breathing shader under
 * its own key, so running it from here never selects that grid cell. Mirrors
 * ShaderLibrary.SweepEffectKeys in nexus-service, which owns the shaders and
 * switches the engine to whole-canvas sampling while one of them runs, so every
 * device shows the entire pattern rather than the slice its layout frame covers.
 */
export const SIMPLE_ANIMATION_KEYS = [
  'sweeprainbow', 'sweepbreathing', 'sweepbars', 'sweepcycle',
  'sweepbrush', 'sweepliquid', 'sweepcomet',
] as const;

type SimpleAnimationKey = typeof SIMPLE_ANIMATION_KEYS[number];

const SIMPLE_ANIMATION_LABELS: Record<SimpleAnimationKey, string> = {
  sweeprainbow: 'lighting.simple.anim.rainbow',
  sweepbreathing: 'lighting.controls.breathing',
  sweepbars: 'lighting.simple.anim.bars',
  sweepcycle: 'lighting.simple.anim.colorCycle',
  sweepbrush: 'lighting.simple.anim.brush',
  sweepliquid: 'lighting.simple.anim.liquidRainbow',
  sweepcomet: 'lighting.simple.anim.goldShine',
};

export function isSimpleAnimation(key: string): boolean {
  return (SIMPLE_ANIMATION_KEYS as readonly string[]).includes(key);
}

/** i18n key of the tile's name. */
export function simpleAnimationLabelKey(key: string): string {
  return SIMPLE_ANIMATION_LABELS[key as SimpleAnimationKey];
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
