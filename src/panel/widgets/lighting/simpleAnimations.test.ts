import { describe, expect, it } from 'vitest';
import { PALETTE_FAMILIES } from '../../../types/lightingPalette';
import {
  ANIMATE_EFFECTS, EFFECT_CATEGORIES, EFFECTS, categoryOf, defaultStateFor,
} from '../../../types/lighting';
import {
  SIMPLE_ANIMATION_KEYS, canonicalSimpleKey, isSimpleAnimation, isSimpleReversed,
  simpleAnimationLabelKey, simpleAnimationState,
} from './simpleAnimations';

describe('simple-mode animations', () => {
  // The row is laid out to land flush with the palette above it: one tile per
  // two swatch columns. Adding a family or a tile without the other silently
  // breaks that alignment, and nothing else would catch it.
  it('paletteSpansTwoSwatches', () => {
    expect(PALETTE_FAMILIES.length).toBe(SIMPLE_ANIMATION_KEYS.length * 2);
  });

  it('names every tile from the effect it runs', () => {
    for (const key of SIMPLE_ANIMATION_KEYS) {
      expect(simpleAnimationLabelKey(key)).toBe(EFFECTS.find(e => e.key === key)?.labelKey);
    }
  });

  // Simple mode runs preset 1 of regular effects, so each must exist in the
  // advanced catalogue, lead the Patterns category, and appear once.
  it('are advanced pattern effects listed first in Patterns', () => {
    for (const key of SIMPLE_ANIMATION_KEYS) {
      expect(ANIMATE_EFFECTS.filter(e => e.key === key)).toHaveLength(1);
      expect(categoryOf(key)).toBe('pattern');
    }
    const patterns = ANIMATE_EFFECTS.filter(e => categoryOf(e.key) === 'pattern').map(e => e.key);
    expect(patterns.slice(0, SIMPLE_ANIMATION_KEYS.length)).toEqual([...SIMPLE_ANIMATION_KEYS]);
  });

  it('labels each effect once', () => {
    const labels = SIMPLE_ANIMATION_KEYS.map(simpleAnimationLabelKey);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Flat lists (the Deck key dropdown, the widget fallback) read ANIMATE_EFFECTS directly.
  it('lists the seven first in the flat animate pool', () => {
    expect(ANIMATE_EFFECTS.slice(0, SIMPLE_ANIMATION_KEYS.length).map(e => e.key)).toEqual([...SIMPLE_ANIMATION_KEYS]);
    const ranks = ANIMATE_EFFECTS.map(e => EFFECT_CATEGORIES.indexOf(categoryOf(e.key)));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('declares the brush params the shader exposes, with no hue step', () => {
    const names = EFFECTS.find(e => e.key === 'sweepbrush')!.params.map(p => p.name);
    expect(names).toEqual(['u_strokes', 'u_feather', 'u_fill', 'u_rotation', 'u_wash']);
  });

  it('puts Patterns first in the category order', () => {
    expect(EFFECT_CATEGORIES[0]).toBe('pattern');
    expect(new Set(EFFECT_CATEGORIES).size).toBe(EFFECT_CATEGORIES.length);
  });

  it('maps retired simple keys to their replacements for display', () => {
    expect(canonicalSimpleKey('sweeprainbow')).toBe('rainbow');
    expect(canonicalSimpleKey('sweepbars')).toBe('sharplines');
    expect(canonicalSimpleKey('sweepbreathing')).toBe('breathing');
    expect(canonicalSimpleKey('sweepcomet')).toBe('sweepcomet');
    expect(isSimpleAnimation('sweeprainbow')).toBe(true);
    expect(simpleAnimationLabelKey('sweepbars')).toBe('lighting.controls.sharplines');
    expect(isSimpleAnimation('plasma')).toBe(false);
  });

  // Simple mode runs preset 1 as it resolves, so an edit there reaches simple.
  it('runs the slot 0 look it is given', () => {
    const slot0 = { ...defaultStateFor('sweepbrush'), speed: 30, hue: 0.25, params: { u_strokes: 6 } };
    const state = simpleAnimationState(slot0, false);
    expect(state).toEqual(slot0);
    expect(state.params).not.toBe(slot0.params);
  });

  // Direction is the speed sign and nothing else: the engine reads a negative
  // speed as time running backwards, and the slot itself is never touched.
  it('negates slot 0 speed for reverse without touching the template', () => {
    const slot0 = { ...defaultStateFor('rainbow'), speed: 40, params: { u_density: 2 } };
    const snapshot = JSON.parse(JSON.stringify(slot0));
    const fwd = simpleAnimationState(slot0, false);
    const rev = simpleAnimationState(slot0, true);
    expect(fwd.speed).toBe(40);
    expect(rev.speed).toBe(-40);
    expect({ ...fwd, speed: 0 }).toEqual({ ...rev, speed: 0 });
    expect(slot0).toEqual(snapshot);
  });

  it('reads reverse as a speed sign opposite to slot 0', () => {
    expect(isSimpleReversed(-40, 40)).toBe(true);
    expect(isSimpleReversed(40, 40)).toBe(false);
    expect(isSimpleReversed(40, -40)).toBe(true);
    expect(isSimpleReversed(-40, -40)).toBe(false);
    expect(isSimpleReversed(40, 0)).toBe(false);
  });
});
