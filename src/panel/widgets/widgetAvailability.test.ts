import { describe, expect, it } from 'vitest';
import { surfaceSupportsTouch } from '../types';
import { WIDGET_REGISTRY, widgetAvailableForSurface } from './registry';
import enLocale from '../../locales/en.json';

describe('surfaceSupportsTouch', () => {
  it('treats y70, phone, and desktop as pointer-capable', () => {
    expect(surfaceSupportsTouch('y70')).toBe(true);
    expect(surfaceSupportsTouch('phone')).toBe(true);
    expect(surfaceSupportsTouch('desktop')).toBe(true);
  });

  it('treats q60 as non-touch', () => {
    expect(surfaceSupportsTouch('q60')).toBe(false);
  });
});

describe('widgetAvailableForSurface', () => {
  it('hides touch-only widgets on q60', () => {
    const snake = WIDGET_REGISTRY.snake;
    expect(widgetAvailableForSurface(snake.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(snake.meta, 'phone')).toBe(true);
    expect(widgetAvailableForSurface(snake.meta, 'q60')).toBe(false);
  });

  it('shows any-input widgets on every supported surface', () => {
    const clock = WIDGET_REGISTRY.clock;
    expect(widgetAvailableForSurface(clock.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(clock.meta, 'q60')).toBe(true);
    expect(widgetAvailableForSurface(clock.meta, 'phone')).toBe(true);
    expect(widgetAvailableForSurface(clock.meta, 'desktop')).toBe(true);
  });

  it('still respects supportedSurfaces for any-input widgets', () => {
    const screentime = WIDGET_REGISTRY.screentime;
    expect(screentime.meta.supportedSurfaces).not.toContain('q60');
    expect(widgetAvailableForSurface(screentime.meta, 'q60')).toBe(false);
    expect(widgetAvailableForSurface(screentime.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(screentime.meta, 'desktop')).toBe(true);
  });

  it('keeps the media widget available on q60 (hybrid)', () => {
    const media = WIDGET_REGISTRY.media;
    expect(media.meta.touch).toBe('any');
    expect(media.meta.supportedSurfaces).toContain('q60');
    expect(widgetAvailableForSurface(media.meta, 'q60')).toBe(true);
  });

  it('makes the seeded dashboard widgets available on desktop', () => {
    for (const type of ['lighting', 'cooling', 'monitoring']) {
      const def = WIDGET_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(widgetAvailableForSurface(def.meta, 'desktop'), `${type} should be available on desktop`).toBe(true);
    }
  });

  it('leaves game and novelty widgets off the desktop dashboard catalog', () => {
    for (const type of ['snake', 'blocks', 'aquarium', 'whiteboard', 'emoji']) {
      const def = WIDGET_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(widgetAvailableForSurface(def.meta, 'desktop'), `${type} should stay kiosk/phone-only`).toBe(false);
    }
  });

  it('classifies every issue-listed touch widget as touch-only', () => {
    const expectedTouchOnly = [
      'lighting',
      'obs',
      'steam',
      'discord',
      'timer',
      'stopwatch',
      'calculator',
      'macros',
      'snake',
      'blocks',
      'aquarium',
      'whiteboard',
      'emoji',
    ];
    for (const type of expectedTouchOnly) {
      const def = WIDGET_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(def.meta.touch, `${type} should be touch-only`).toBe('touch-only');
      expect(widgetAvailableForSurface(def.meta, 'q60'), `${type} must be unavailable on q60`).toBe(false);
    }
  });
});

describe('widget i18n keys', () => {
  // Every cell rendered on the panel surface (and the dashboard) shows the
  // widget name underneath via WidgetCellLabel + this i18nKey lookup. A
  // missing key would render the raw widget type ('cooling' etc.)
  // instead of the localised name, so guard the contract here.
  it('every widget in the registry has an i18nKey that resolves in en.json', () => {
    const dictionary = enLocale as Record<string, string>;
    for (const [type, def] of Object.entries(WIDGET_REGISTRY)) {
      expect(def.meta.i18nKey, `${type} is missing meta.i18nKey`).toBeTruthy();
      const value = dictionary[def.meta.i18nKey];
      expect(typeof value, `${def.meta.i18nKey} (for widget ${type}) is not a string in en.json`).toBe('string');
      expect(value!.length, `${def.meta.i18nKey} (for widget ${type}) is empty in en.json`).toBeGreaterThan(0);
    }
  });
});
