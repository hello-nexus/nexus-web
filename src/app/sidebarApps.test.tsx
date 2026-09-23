import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PINNED_TAIL, getSidebarAppMeta, isPinnableAppKey, listSidebarAppKeys, sanitizePinnedTail, sanitizeRecents } from './sidebarApps';
import { APP_REGISTRY } from '../panel/widgets/registry';
import { Boxes, Film } from 'lucide-react';
import { appIconComponent } from '../components/icons/AppIconImage';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
  typeForMarketplace,
} from '../widgets/marketplaceRegistry';
import type { AppInstalledListing, AppManifestCapabilities } from '../widgets/types';

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

describe('getSidebarAppMeta - SDK app manifest icon', () => {
  const MARK = '/apps-api/installed/com.ibuypower.control/asset/assets/mark.svg';

  it('renders the app manifest icon for a preinstalled app', () => {
    _seedMarketplaceRegistryForTests([
      listing({
        id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true,
        iconUrl: MARK,
      }),
    ]);
    const meta = getSidebarAppMeta(typeForMarketplace('com.ibuypower.control'));
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).toBe(appIconComponent(MARK));
  });

  // The OEM flag decides whether an app auto-seeds onto the sidebar, not which
  // glyph it draws - an app that ships a mark renders it on every machine.
  it('renders the manifest icon for a non-preinstalled app too', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true, iconUrl: '/x.svg' }),
    ]);
    const meta = getSidebarAppMeta(typeForMarketplace('com.hellonexus.weather'));
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).toBe(appIconComponent('/x.svg'));
  });

  it('falls back to the generic glyph for an app that ships no icon', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.plain', name: 'Plain', page: true }),
    ]);
    const meta = getSidebarAppMeta(typeForMarketplace('com.hellonexus.plain'));
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).toBe(Boxes);
  });

  it('leaves a built-in app (e.g. clock) untouched', () => {
    const meta = getSidebarAppMeta('clock');
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).not.toBe(Boxes);
  });
});

describe('page-only apps (Store)', () => {
  it('resolves sidebar meta from the page-only registry', () => {
    const meta = getSidebarAppMeta('store');
    expect(meta).not.toBeNull();
    expect(meta!.i18nKey).toBe('apps.tabs.store');
  });

  it('is pinnable, so it can be pinned and persisted', () => {
    expect(isPinnableAppKey('store')).toBe(true);
    expect(sanitizePinnedTail(['store'])).toEqual(['store']);
  });

  it('is not in the default pinned tail', () => {
    expect(DEFAULT_PINNED_TAIL).not.toContain('store');
  });
});

describe('page-only apps (Frames)', () => {
  it('resolves sidebar meta from the page-only registry, not the widget registry', () => {
    const meta = getSidebarAppMeta('frames');
    expect(meta).not.toBeNull();
    expect(meta!.i18nKey).toBe('panel.widget.frames');
    expect((meta!.icon as ReactElement).type).toBe(Film);
  });

  it('keeps an existing pin and recents entry after leaving the widget registry', () => {
    expect(isPinnableAppKey('frames')).toBe(true);
    expect(sanitizePinnedTail(['frames'])).toEqual(['frames']);
    expect(sanitizeRecents(['frames'])).toEqual(['frames']);
  });

  it('is not in the default pinned tail', () => {
    expect(DEFAULT_PINNED_TAIL).not.toContain('frames');
  });
});

describe('sanitizePinnedTail - marketplace registry-load window', () => {
  const IBP = typeForMarketplace('com.ibuypower.control');

  it('preserves an app-typed pin while the registry has not loaded yet', () => {
    // afterEach leaves the registry reset (never loaded). A cold refresh reads
    // the persisted tail before the registry HTTP lands; stripping the app key
    // here would silently unpin the OEM app for good.
    expect(sanitizePinnedTail(['clock', IBP])).toEqual(['clock', IBP]);
  });

  it('keeps an app-typed pin once its listing has loaded', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    expect(sanitizePinnedTail([IBP])).toEqual([IBP]);
  });

  it('drops an app-typed pin that is uninstalled after the registry loaded', () => {
    _seedMarketplaceRegistryForTests([]); // loaded, but the app is not installed
    expect(sanitizePinnedTail([IBP])).toEqual([]);
  });
});

describe('listSidebarAppKeys', () => {
  it('lists page-only apps and built-ins with a Page, and no page-less widget', () => {
    const keys = listSidebarAppKeys();
    expect(keys).toContain('frames');
    const pageless = Object.entries(APP_REGISTRY).filter(([, def]) => def.Page == null).map(([key]) => key);
    expect(pageless.length).toBeGreaterThan(0);
    for (const key of pageless) expect(keys).not.toContain(key);
    for (const key of keys) expect(isPinnableAppKey(key)).toBe(true);
  });

  it('lists a page-capable SDK app but not a widget-only one', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true }),
      listing({ id: 'com.hellonexus.tile', name: 'Tile', page: false }),
    ]);
    const keys = listSidebarAppKeys();
    expect(keys).toContain(typeForMarketplace('com.hellonexus.weather'));
    expect(keys).not.toContain(typeForMarketplace('com.hellonexus.tile'));
  });
});
