import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_VISUALIZER,
  MEDIA_VISUALIZER_EFFECTS,
  nextVisualizerEffect,
  normalizeVisualizerEffect,
  visualizerLabelKey,
  visualizerState,
} from './mediaVisualizers';
import { EFFECTS } from '../../../types/lighting';

describe('media visualizer catalog', () => {
  it('offers only effects that exist in the animate catalog and are audio-reactive', () => {
    for (const key of MEDIA_VISUALIZER_EFFECTS) {
      const def = EFFECTS.find(e => e.key === key);
      expect(def, key).toBeTruthy();
      // A non-audio effect would render its idle animation forever and never
      // react to the track.
      expect(def?.audio, key).toBe(true);
    }
  });

  it('falls back to the default for a key that is not in the set', () => {
    expect(normalizeVisualizerEffect('plasma')).toBe(DEFAULT_MEDIA_VISUALIZER);
    expect(normalizeVisualizerEffect(undefined)).toBe(DEFAULT_MEDIA_VISUALIZER);
    expect(normalizeVisualizerEffect(7)).toBe(DEFAULT_MEDIA_VISUALIZER);
  });

  it('cycles through every effect and wraps', () => {
    const seen: string[] = [];
    let key = DEFAULT_MEDIA_VISUALIZER;
    for (let i = 0; i < MEDIA_VISUALIZER_EFFECTS.length; i++) {
      seen.push(key);
      key = nextVisualizerEffect(key);
    }
    expect(new Set(seen).size).toBe(MEDIA_VISUALIZER_EFFECTS.length);
    expect(key).toBe(DEFAULT_MEDIA_VISUALIZER);
  });

  it('cycles from an unknown key rather than sticking', () => {
    expect(nextVisualizerEffect('nope')).toBe(MEDIA_VISUALIZER_EFFECTS[1]);
  });

  it('resolves a label key for every offered effect', () => {
    for (const key of MEDIA_VISUALIZER_EFFECTS) {
      expect(visualizerLabelKey(key), key).toMatch(/^lighting\.controls\./);
    }
  });

  it('merges a preset slot over the effect base, keeping params the slot omits', () => {
    const bundle = {
      selected: 1,
      slots: [
        { speed: 10, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} },
        { speed: 80, intensity: 1, hue: 0.5, colorize: 0, saturation: 1, contrast: 1, params: { u_glow: 1.9 } },
      ],
    };
    const state = visualizerState('spectrumaurora', bundle);
    expect(state.speed).toBe(80);
    expect(state.params.u_glow).toBe(1.9);
    // Carried from the effect's base params, not the slot.
    expect(state.params.u_curtains).toBeDefined();
  });

  it('uses the effect base when no bundle has hydrated', () => {
    const state = visualizerState('spectrumaurora', undefined);
    expect(state.params.u_curtains).toBeDefined();
  });
});
