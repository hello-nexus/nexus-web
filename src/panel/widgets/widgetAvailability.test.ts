import { describe, expect, it } from 'vitest';
import { isSingleWidgetSurface, surfaceSupportsTouch } from '../types';
import { sizesForSurface, WIDGET_REGISTRY, widgetAvailableForSurface } from './registry';
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

  it('still respects supportedSurfaces for non-q60 surfaces', () => {
    // y70 / phone / desktop still gate on the explicit supportedSurfaces
    // list. Only q60 derives availability from capabilities.
    const cooling = WIDGET_REGISTRY.cooling;
    expect(widgetAvailableForSurface(cooling.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(cooling.meta, 'desktop')).toBe(true);
  });

  it('keeps the media widget available on q60 (hybrid)', () => {
    const media = WIDGET_REGISTRY.media;
    expect(media.meta.touch).toBe('any');
    expect(media.meta.supportedSurfaces).toContain('q60');
    expect(widgetAvailableForSurface(media.meta, 'q60')).toBe(true);
  });

  it('derives q60 availability from (has 2x4 size) AND (not touch-only)', () => {
    // Per user spec 2026-05-18: "widgets in the q-series library should
    // be filtered by 2x4 and no-touch". The filter ignores
    // supportedSurfaces for q60 and uses capabilities instead so a new
    // non-touch widget with a 2x4 variant gets picked up automatically.

    // Positive: every non-touch widget that declares a 2x4 size variant
    // is available on q60.
    for (const type of ['clock', 'monitoring', 'media', 'iframe', 'gallery',
                        'screentime', 'cooling', 'twitch']) {
      const def = WIDGET_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(def.meta.sizes, `${type} should declare 2x4 in sizes`).toContain('2x4');
      expect(def.meta.touch, `${type} should not be touch-only`).not.toBe('touch-only');
      expect(widgetAvailableForSurface(def.meta, 'q60'),
        `${type} should be available on q60 (has 2x4 + non-touch)`).toBe(true);
    }
  });

  it('excludes displays from q60 (touch-only sliders)', () => {
    const displays = WIDGET_REGISTRY.displays;
    // displays uses pointer-driven brightness / contrast sliders so it's
    // touch-only despite being usable on multiple form factors.
    expect(displays.meta.touch).toBe('touch-only');
    expect(widgetAvailableForSurface(displays.meta, 'q60')).toBe(false);
    // Still available on touch-capable surfaces.
    expect(widgetAvailableForSurface(displays.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(displays.meta, 'phone')).toBe(true);
  });

  it('excludes devices from q60 (touch-only pager + per-device taps)', () => {
    const devices = WIDGET_REGISTRY.devices;
    // devices widget pages through attached peripherals via tap; can't
    // be driven without touch.
    expect(devices.meta.touch).toBe('touch-only');
    expect(widgetAvailableForSurface(devices.meta, 'q60')).toBe(false);
    // Still available on touch-capable surfaces.
    expect(widgetAvailableForSurface(devices.meta, 'y70')).toBe(true);
    expect(widgetAvailableForSurface(devices.meta, 'phone')).toBe(true);
    expect(widgetAvailableForSurface(devices.meta, 'desktop')).toBe(true);
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

describe('sizesForSurface', () => {
  it('hides 2x4 from every multi-widget surface', () => {
    // 2x4 is reserved for the q60 single-widget surface. y70 / phone /
    // desktop should never see it offered in the size picker, even on
    // widgets that declare 2x4 in their `sizes`.
    for (const surface of ['y70', 'phone', 'desktop'] as const) {
      for (const type of ['clock', 'monitoring', 'media', 'iframe', 'gallery']) {
        const def = WIDGET_REGISTRY[type];
        expect(def.meta.sizes, `${type} should declare 2x4`).toContain('2x4');
        expect(sizesForSurface(def.meta, surface), `${type} on ${surface}`).not.toContain('2x4');
      }
    }
  });

  it('locks single-widget surfaces to their single size', () => {
    // q60 is the only single-widget surface today: any q60-eligible
    // widget gets exactly ['2x4'] back.
    const monitoring = WIDGET_REGISTRY.monitoring;
    expect(sizesForSurface(monitoring.meta, 'q60')).toEqual(['2x4']);
  });

  it('returns [] on a single-widget surface for widgets that lack the locked size', () => {
    // calculator declares ['2x2', '4x4'] (no 2x4). On q60 there's no
    // valid size, so the picker offers nothing.
    const calculator = WIDGET_REGISTRY.calculator;
    expect(calculator.meta.sizes).not.toContain('2x4');
    expect(sizesForSurface(calculator.meta, 'q60')).toEqual([]);
  });

  it('returns the manifest sizes verbatim when no surface is passed', () => {
    const monitoring = WIDGET_REGISTRY.monitoring;
    expect(sizesForSurface(monitoring.meta)).toEqual([...monitoring.meta.sizes]);
  });
});

describe('isSingleWidgetSurface', () => {
  it('marks q60 as single-widget and everyone else as multi', () => {
    expect(isSingleWidgetSurface('q60')).toBe(true);
    expect(isSingleWidgetSurface('y70')).toBe(false);
    expect(isSingleWidgetSurface('phone')).toBe(false);
    expect(isSingleWidgetSurface('desktop')).toBe(false);
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
