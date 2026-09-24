// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ANIMATE_EFFECTS, DEFAULT_STATIC_EFFECT, EFFECTS, MODES, SIMPLE_EFFECT_KEYS, STATIC_EFFECTS,
  STATIC_PATTERN_KEYS, categoryOf, isStaticEffect, isStaticFill,
} from './lighting';
import { normalizeSync } from '../hooks/useLightingSync';
import {
  PANEL_BACKGROUND_EFFECTS, normalizePanelBackgroundEffect,
} from '../panel/background/panelBackground';

describe('static mode catalog', () => {
  it('sits between off and animation in the mode row', () => {
    expect(MODES.map(m => m.key)).toEqual(['none', 'static', 'animate', 'gif', 'screen', 'gamesync']);
  });

  it('gives the solid fills to static only', () => {
    for (const key of SIMPLE_EFFECT_KEYS) {
      expect(isStaticFill(key), key).toBe(true);
      expect(STATIC_EFFECTS.some(e => e.key === key), key).toBe(true);
      expect(ANIMATE_EFFECTS.some(e => e.key === key), key).toBe(false);
    }
  });

  it('keeps the static patterns out of the animate pool', () => {
    // They have no clock, so Animation selecting one would sit motionless.
    for (const key of STATIC_PATTERN_KEYS) {
      expect(isStaticEffect(key), key).toBe(true);
      expect(isStaticFill(key), key).toBe(false);
      expect(STATIC_EFFECTS.some(e => e.key === key), key).toBe(true);
      expect(ANIMATE_EFFECTS.some(e => e.key === key), key).toBe(false);
    }
  });

  it('leaves the animate catalog non-empty and disjoint from static', () => {
    expect(ANIMATE_EFFECTS.length).toBeGreaterThan(30);
    for (const def of ANIMATE_EFFECTS) {
      expect(isStaticEffect(def.key), `${def.key} in both pools`).toBe(false);
    }
  });

  it('lists only keys that exist in the effect catalog', () => {
    for (const key of STATIC_PATTERN_KEYS) {
      expect(EFFECTS.some(e => e.key === key), key).toBe(true);
    }
  });

  it('defaults to the linear gradient', () => {
    // Mirrors StaticEffectCatalog.DefaultEffect in nexus-service.
    expect(DEFAULT_STATIC_EFFECT).toBe('gradientlinear');
    expect(isStaticEffect(DEFAULT_STATIC_EFFECT)).toBe(true);
  });
});

describe('normalizeSync', () => {
  it('maps the static sync value', () => {
    expect(normalizeSync('static')).toBe('static');
  });

  it('maps a fill key written before the mode existed', () => {
    // Settings from an older build, and Stream Deck rgbEffect buttons, still
    // name the fill directly; the service redirects them into static.
    expect(normalizeSync('simplered')).toBe('static');
    expect(normalizeSync('simplewhite')).toBe('static');
  });

  it('leaves the other modes alone', () => {
    expect(normalizeSync('rainbow')).toBe('animate');
    expect(normalizeSync('none')).toBe('none');
    expect(normalizeSync('')).toBe('none');
    expect(normalizeSync('screen')).toBe('screen');
    expect(normalizeSync('gif')).toBe('gif');
    expect(normalizeSync('gamesync')).toBe('gamesync');
  });
});

describe('static colour params', () => {
  it('gives every non-flat static effect at least one colour slot', () => {
    for (const def of STATIC_EFFECTS) {
      if (isStaticFill(def.key)) continue;
      expect(def.colors?.length ?? 0, `${def.key} has no colour slot`).toBeGreaterThan(0);
    }
  });
});

describe('panel backgrounds', () => {
  it('keeps the static patterns renderable as backgrounds', () => {
    // Panel backgrounds render through the same useShaderRenderer path, which
    // fetches /lighting/shaders/{key}; the service test pins that every catalog
    // key is fetchable, so these stay renderable here. The Animations tab only
    // browses the gradients of the set - the rest stay valid stored values.
    for (const key of STATIC_PATTERN_KEYS) {
      expect(normalizePanelBackgroundEffect(key), key).toBe(key);
    }
  });

  it('browses only the gradients of the static set', () => {
    for (const key of STATIC_PATTERN_KEYS) {
      const browsable = PANEL_BACKGROUND_EFFECTS.some(e => e.key === key);
      expect(browsable, key).toBe(categoryOf(key) === 'gradient');
    }
  });

  it('keeps them free of the audio gate that excludes reactive effects', () => {
    for (const def of STATIC_EFFECTS) {
      expect(def.audio ?? false, `${def.key} marked audio`).toBe(false);
    }
  });
});

describe('sync classification edge cases', () => {
  it('does not mistake the mirror pattern for screen mirror', () => {
    expect(normalizeSync('mirror')).toBe('static');
    expect(normalizeSync('screen')).toBe('screen');
  });

  it('classifies every static key exactly', () => {
    for (const def of STATIC_EFFECTS) expect(normalizeSync(def.key), def.key).toBe('static');
  });
});
