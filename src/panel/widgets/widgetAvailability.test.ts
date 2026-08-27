// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { isSingleWidgetSurface, surfaceSupportsTouch } from '../types';
import {
  sizesForSurface,
  APP_REGISTRY,
  appAvailableForSurface,
  pickerSizeFor,
  getCatalogEntries,
  lookupApp,
} from './registry';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
  typeForMarketplace,
} from '../../widgets/marketplaceRegistry';
import type { AppInstalledListing, AppManifestCapabilities } from '../../widgets/types';
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

  it('gates monitor per device: touch only with an explicit digitizer', () => {
    // No record info / unknown → non-touch (q-series-like default).
    expect(surfaceSupportsTouch('monitor')).toBe(false);
    expect(surfaceSupportsTouch('monitor', false)).toBe(false);
    expect(surfaceSupportsTouch('monitor', true)).toBe(true);
    // deviceTouch never loosens fixed surfaces.
    expect(surfaceSupportsTouch('q60', true)).toBe(false);
    expect(surfaceSupportsTouch('y70', false)).toBe(true);
  });
});

describe('per-device touch gating on monitor panels', () => {
  it('hides touch-required widgets unless the monitor has touch', () => {
    const lighting = APP_REGISTRY.lighting;
    expect(appAvailableForSurface(lighting.meta, 'monitor')).toBe(false);
    expect(appAvailableForSurface(lighting.meta, 'monitor', { deviceTouch: false })).toBe(false);
    expect(appAvailableForSurface(lighting.meta, 'monitor', { deviceTouch: true })).toBe(true);
  });

  it('keeps non-touch widgets available either way', () => {
    const clock = APP_REGISTRY.clock;
    expect(appAvailableForSurface(clock.meta, 'monitor', { deviceTouch: false })).toBe(true);
    expect(appAvailableForSurface(clock.meta, 'monitor', { deviceTouch: true })).toBe(true);
  });

  it('returns no sizes for touch widgets on a non-touch monitor', () => {
    const lighting = APP_REGISTRY.lighting;
    expect(sizesForSurface(lighting.meta, 'monitor', false)).toEqual([]);
    expect(sizesForSurface(lighting.meta, 'monitor', true).length).toBeGreaterThan(0);
  });
});

describe('appAvailableForSurface', () => {
  it('hides touch-required widgets on q60', () => {
    const lighting = APP_REGISTRY.lighting;
    expect(appAvailableForSurface(lighting.meta, 'y70')).toBe(true);
    expect(appAvailableForSurface(lighting.meta, 'phone')).toBe(true);
    expect(appAvailableForSurface(lighting.meta, 'q60')).toBe(false);
  });

  it('shows non-touch widgets on every surface that fits a size', () => {
    const clock = APP_REGISTRY.clock;
    expect(appAvailableForSurface(clock.meta, 'y70')).toBe(true);
    expect(appAvailableForSurface(clock.meta, 'q60')).toBe(true);
    expect(appAvailableForSurface(clock.meta, 'phone')).toBe(true);
    expect(appAvailableForSurface(clock.meta, 'desktop')).toBe(true);
  });

  it('keeps the media widget available on q60 (declares 2x4 + non-touch)', () => {
    const media = APP_REGISTRY.media;
    expect(media.meta.touch).toBe(false);
    expect(media.meta.sizes).toContain('2x4');
    expect(appAvailableForSurface(media.meta, 'q60')).toBe(true);
  });

  it('derives q60 availability from (has 2x4 size) AND (not touch-required)', () => {
    // Per user spec: "widgets in the q-series library should be filtered by
    // 2x4 and no-touch". Availability falls out of capabilities so a new
    // non-touch widget with a 2x4 variant gets picked up automatically.
    for (const type of ['clock', 'monitoring', 'media', 'gallery',
                        'screentime', 'twitch', 'weather']) {
      const def = APP_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(def.meta.sizes, `${type} should declare 2x4 in sizes`).toContain('2x4');
      expect(def.meta.touch, `${type} should be non-touch`).toBe(false);
      expect(appAvailableForSurface(def.meta, 'q60'),
        `${type} should be available on q60 (has 2x4 + non-touch)`).toBe(true);
    }
  });

  it('excludes displays from q60 (touch-required sliders)', () => {
    const displays = APP_REGISTRY.displays;
    expect(displays.meta.touch).toBe(true);
    expect(appAvailableForSurface(displays.meta, 'q60')).toBe(false);
    expect(appAvailableForSurface(displays.meta, 'y70')).toBe(true);
    expect(appAvailableForSurface(displays.meta, 'phone')).toBe(true);
    expect(appAvailableForSurface(displays.meta, 'desktop')).toBe(true);
  });

  it('hides local-only widgets on remotely-connected panels', () => {
    // No built-in widget is local-only today; verify the surface filter still
    // honors the flag for any future local-only widget.
    const localOnly = { ...APP_REGISTRY.clock.meta, localOnly: true };
    // Local (hard-wired) panels show it; remote (paired phone/browser/app) hide it.
    expect(appAvailableForSurface(localOnly, 'y70', { remote: false })).toBe(true);
    expect(appAvailableForSurface(localOnly, 'phone', { remote: true })).toBe(false);
    expect(appAvailableForSurface(localOnly, 'desktop', { remote: true })).toBe(false);
    // Non-local-only widgets are unaffected by the remote flag.
    expect(appAvailableForSurface(APP_REGISTRY.clock.meta, 'phone', { remote: true })).toBe(true);
  });

  it('exposes every widget on the desktop dashboard (pointer + every multi-widget size)', () => {
    // Desktop has a mouse (pointer-capable) and accepts every multi-widget
    // size. Per the canonical rule, availability is determined by touch +
    // sizes only - no per-widget surface allowlist - so every widget in the
    // registry should be reachable from the desktop add-widget picker.
    // The reach flags are the exceptions: remote-only widgets are hidden
    // because desktop is the host's own surface, panel-only widgets because
    // the desktop never opens the fullscreen view they're played in.
    for (const [type, def] of Object.entries(APP_REGISTRY)) {
      expect(appAvailableForSurface(def.meta, 'desktop'),
        `${type} on desktop`).toBe(!def.meta.remoteOnly && !def.meta.panelOnly);
    }
  });

  it('exposes every widget on Y70 (touch + every multi-widget size)', () => {
    for (const [type, def] of Object.entries(APP_REGISTRY)) {
      expect(appAvailableForSurface(def.meta, 'y70'),
        `${type} on y70`).toBe(!def.meta.remoteOnly);
    }
  });

  it('hides panel-only widgets (games) on desktop but keeps them on panels', () => {
    // snake/blocks are played only in their fullscreen Touch view, which the
    // embedded dashboard and desktop overlay never enter - a tile there is
    // inert, so they're offered on on-device panels only.
    for (const type of ['snake', 'blocks']) {
      const def = APP_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(def.meta.panelOnly, `${type} should be panel-only`).toBe(true);
      expect(def.Touch, `${type} should ship a fullscreen view`).toBeDefined();
      expect(appAvailableForSurface(def.meta, 'desktop'), `${type} on desktop`).toBe(false);
      expect(sizesForSurface(def.meta, 'desktop'), `${type} sizes on desktop`).toEqual([]);
      expect(appAvailableForSurface(def.meta, 'y70'), `${type} on y70`).toBe(true);
      expect(appAvailableForSurface(def.meta, 'phone'), `${type} on phone`).toBe(true);
      expect(appAvailableForSurface(def.meta, 'monitor', { deviceTouch: true }),
        `${type} on a touch monitor`).toBe(true);
    }
  });

  it('leaves non-panel-only widgets on the desktop', () => {
    expect(APP_REGISTRY.clock.meta.panelOnly).toBeUndefined();
    expect(appAvailableForSurface(APP_REGISTRY.clock.meta, 'desktop')).toBe(true);
  });

  it('hides remote-only widgets (transfer) on the host\'s own panel surfaces', () => {
    const transfer = APP_REGISTRY.transfer;
    expect(transfer.meta.remoteOnly).toBe(true);
    // The phone surface only exists on remotely-connected panels, so it
    // defaults to remote even when the caller doesn't pass the flag.
    expect(appAvailableForSurface(transfer.meta, 'phone')).toBe(true);
    expect(appAvailableForSurface(transfer.meta, 'phone', { remote: true })).toBe(true);
    expect(appAvailableForSurface(transfer.meta, 'y70')).toBe(false);
    expect(appAvailableForSurface(transfer.meta, 'desktop')).toBe(false);
    expect(appAvailableForSurface(transfer.meta, 'y70', { remote: false })).toBe(false);
    // Non-remote-only widgets are unaffected.
    expect(appAvailableForSurface(APP_REGISTRY.clock.meta, 'desktop')).toBe(true);
  });

  it('classifies the canonical touch-required widgets as touch:true', () => {
    const expectedTouch = [
      'lighting',
      'obs',
      'steam',
      'timer',
      'stopwatch',
      'calculator',
      'cooling',
      'deck',
      'emoji',
      'whiteboard',
      'mixer',
    ];
    for (const type of expectedTouch) {
      const def = APP_REGISTRY[type];
      expect(def, `missing widget type: ${type}`).toBeDefined();
      expect(def.meta.touch, `${type} should require touch`).toBe(true);
      expect(appAvailableForSurface(def.meta, 'q60'), `${type} must be unavailable on q60`).toBe(false);
    }
  });
});

describe('sizesForSurface', () => {
  it('hides 2x4 from every multi-widget surface', () => {
    // 2x4 is reserved for the q60 single-widget surface. y70 / phone /
    // desktop should never see it offered in the size picker, even on
    // widgets that declare 2x4 in their `sizes`.
    for (const surface of ['y70', 'phone', 'desktop'] as const) {
      for (const type of ['clock', 'monitoring', 'media', 'gallery']) {
        const def = APP_REGISTRY[type];
        expect(def.meta.sizes, `${type} should declare 2x4`).toContain('2x4');
        expect(sizesForSurface(def.meta, surface), `${type} on ${surface}`).not.toContain('2x4');
      }
    }
  });

  it('locks single-widget surfaces to their single size', () => {
    // q60 is the only single-widget surface today: any q60-eligible
    // widget gets exactly ['2x4'] back.
    const monitoring = APP_REGISTRY.monitoring;
    expect(sizesForSurface(monitoring.meta, 'q60')).toEqual(['2x4']);
  });

  it('returns [] on a single-widget surface for widgets that lack the locked size', () => {
    // calculator declares ['4x4'] (no 2x4). On q60 there's no valid
    // size, so the picker offers nothing.
    const calculator = APP_REGISTRY.calculator;
    expect(calculator.meta.sizes).not.toContain('2x4');
    expect(sizesForSurface(calculator.meta, 'q60')).toEqual([]);
  });

  it('returns [] for touch-required widgets on q60 regardless of size', () => {
    const lighting = APP_REGISTRY.lighting;
    expect(lighting.meta.touch).toBe(true);
    expect(sizesForSurface(lighting.meta, 'q60')).toEqual([]);
  });

  it('returns the manifest sizes verbatim when no surface is passed', () => {
    const monitoring = APP_REGISTRY.monitoring;
    expect(sizesForSurface(monitoring.meta)).toEqual([...monitoring.meta.sizes]);
  });
});

describe('pickerSizeFor', () => {
  // Multi-widget rule: prefer the larger of the 2x2/4x2 pair (4x2); fall back
  // to a widget's sole supported size (4x4 / 2x2 / 1x1). Drives the variable
  // tile sizes in the proportional catalog.
  it('prefers 4x2 when a widget supports it', () => {
    for (const type of ['clock', 'cooling', 'lighting', 'obs',
                        'screentime', 'gallery', 'media', 'displays',
                        'stopwatch', 'timer', 'monitoring', 'deck']) {
      const def = APP_REGISTRY[type];
      expect(def.meta.sizes, `${type} should declare 4x2`).toContain('4x2');
      expect(pickerSizeFor(def.meta, 'y70'), `${type} on y70`).toBe('4x2');
    }
  });

  it('falls back to a sole supported size when 4x2 is unavailable', () => {
    // 4x4-only widgets fall back to their sole supported size.
    expect(pickerSizeFor(APP_REGISTRY.calculator.meta, 'y70')).toBe('4x4');
    expect(pickerSizeFor(APP_REGISTRY.steam.meta, 'y70')).toBe('4x4');
  });

  it('drops 2x4 first, then applies the rule (twitch becomes 4x4)', () => {
    // twitch declares ['2x4', '4x4']; 2x4 is reserved for q60, so on y70 only
    // 4x4 remains -> the sole-size fallback returns 4x4.
    expect(APP_REGISTRY.twitch.meta.sizes).toEqual(['2x4', '4x4']);
    expect(pickerSizeFor(APP_REGISTRY.twitch.meta, 'y70')).toBe('4x4');
  });

  it('locks to the single size on q60 regardless of the rule', () => {
    expect(pickerSizeFor(APP_REGISTRY.clock.meta, 'q60')).toBe('2x4');
    expect(pickerSizeFor(APP_REGISTRY.monitoring.meta, 'q60')).toBe('2x4');
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

describe('catalog listing (delist)', () => {
  // Delisted from the Add-a-Widget picker but still resolvable: an existing
  // placed instance keeps rendering; only new insertion is removed.
  const DELISTED = ['steam'] as const;

  it('hides the delisted built-ins from the picker yet keeps them resolvable', () => {
    const listedTypes = new Set(
      getCatalogEntries()
        .filter(([, def]) => def.meta.listed !== false)
        .map(([type]) => type),
    );
    for (const type of DELISTED) {
      expect(APP_REGISTRY[type], `missing widget type: ${type}`).toBeDefined();
      expect(APP_REGISTRY[type].meta.listed, `${type} should be delisted`).toBe(false);
      expect(listedTypes.has(type), `${type} must not appear in the picker`).toBe(false);
      expect(lookupApp(type), `${type} must stay resolvable for placed instances`).toBeDefined();
    }
  });

  it('leaves every other built-in listed', () => {
    for (const [type, def] of Object.entries(APP_REGISTRY)) {
      if ((DELISTED as readonly string[]).includes(type)) continue;
      expect(def.meta.listed !== false, `${type} should stay listed`).toBe(true);
    }
  });
});

describe('marketplace listing derives from the preinstalled + page signal', () => {
  function listing(over: Partial<AppInstalledListing>): AppInstalledListing {
    return {
      id: 'x',
      name: 'X',
      version: '1.0.0',
      surfaces: ['dashboard'],
      capabilities: {} as AppManifestCapabilities,
      source: 'bundled',
      ...over,
    };
  }
  afterEach(() => _resetMarketplaceRegistryForTests());

  it('delists a general-purpose SDK app (native equivalent already covers it)', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true }),
    ]);
    const byType = new Map(getCatalogEntries());
    expect(byType.get(typeForMarketplace('com.hellonexus.weather'))?.meta.listed).toBe(false);
  });

  it('delists a preinstalled app with no page surface', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'a.preinstalled.nopage', name: 'NoPage', preinstalled: true, page: false }),
    ]);
    const byType = new Map(getCatalogEntries());
    expect(byType.get(typeForMarketplace('a.preinstalled.nopage'))?.meta.listed).toBe(false);
  });

  it('lists the OEM bake-in app on the machine it was bundled for', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    const byType = new Map(getCatalogEntries());
    expect(byType.get(typeForMarketplace('com.ibuypower.control'))?.meta.listed).toBe(true);
  });
});

describe('widget i18n keys', () => {
  // Every cell rendered on the panel surface (and the dashboard) shows the
  // widget name underneath via WidgetCellLabel + this i18nKey lookup. A
  // missing key would render the raw widget type ('cooling' etc.)
  // instead of the localised name, so guard the contract here.
  it('every widget in the registry has an i18nKey that resolves in en.json', () => {
    const dictionary = enLocale as Record<string, string>;
    for (const [type, def] of Object.entries(APP_REGISTRY)) {
      expect(def.meta.i18nKey, `${type} is missing meta.i18nKey`).toBeTruthy();
      const value = dictionary[def.meta.i18nKey];
      expect(typeof value, `${def.meta.i18nKey} (for widget ${type}) is not a string in en.json`).toBe('string');
      expect(value!.length, `${def.meta.i18nKey} (for widget ${type}) is empty in en.json`).toBeGreaterThan(0);
    }
  });
});
