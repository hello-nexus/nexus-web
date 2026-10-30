import { EFFECTS, type EffectState } from '../../../types/lighting';

/**
 * Simple mode's animation set: the tiles offered under the colour palette.
 *
 * They are ordinary advanced effects (the lead of the Patterns category) and
 * simple mode runs the first preset, template slot SIMPLE_SLOT, of each. Editing
 * that preset in advanced therefore changes simple mode too, and simple mode
 * never touches the other slots. The service renders them across the whole canvas
 * so every device shows the entire pattern.
 */
export const SIMPLE_ANIMATION_KEYS = [
  'rainbow', 'sharplines', 'breathing', 'sweepcycle',
  'sweepbrush', 'sweepliquid', 'sweepcomet',
] as const;

/** The template slot simple mode reads and selects. */
export const SIMPLE_SLOT = 0;

/**
 * Keys an older service or cached state may still report, mapped to the
 * effect that replaced them. Display only: nothing is ever sent under these.
 */
const LEGACY_KEY_ALIASES: Record<string, string> = {
  sweeprainbow: 'rainbow',
  sweepbars: 'sharplines',
  sweepbreathing: 'breathing',
};

/** The current key for one that may be a retired simple-mode key. */
export function canonicalSimpleKey(key: string): string {
  return LEGACY_KEY_ALIASES[key] ?? key;
}

export function isSimpleAnimation(key: string): boolean {
  return (SIMPLE_ANIMATION_KEYS as readonly string[]).includes(canonicalSimpleKey(key));
}

/** i18n key of the tile's name, from the effect's own label. */
export function simpleAnimationLabelKey(key: string): string {
  const canonical = canonicalSimpleKey(key);
  return EFFECTS.find(e => e.key === canonical)?.labelKey ?? canonical;
}

/**
 * The look simple mode runs: the effect's resolved preset 1. Every shader in
 * the set travels one way (+x), so direction is the speed sign - the engine
 * reads a negative speed as time running backwards, which turns the pattern
 * around on every device at once. Reverse is sent as the running state only;
 * the slot itself is never written.
 */
export function simpleAnimationState(slot0: EffectState, reversed: boolean): EffectState {
  return {
    ...slot0,
    params: { ...slot0.params },
    speed: reversed ? -slot0.speed : slot0.speed,
  };
}

/**
 * Whether a running state is the reversed form of preset 1: its speed sign is
 * opposite to the slot's. A zero speed has no direction, so it reads forward.
 */
export function isSimpleReversed(runningSpeed: number, slot0Speed: number): boolean {
  return runningSpeed * slot0Speed < 0;
}
