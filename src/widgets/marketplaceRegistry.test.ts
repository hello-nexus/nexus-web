// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { AppManifestCapabilities } from './types';
import type { AppInstalledListing } from './types';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
  getPreinstalledPageAppTypes,
  isMarketplaceIdEnabled,
  typeForMarketplace,
} from './marketplaceRegistry';

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

describe('getPreinstalledPageAppTypes', () => {
  it('returns only preinstalled apps that ship a page surface', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.example.oem', name: 'OEM App', preinstalled: true, page: true }),
      listing({ id: 'a.preinstalled.nopage', name: 'NoPage', preinstalled: true, page: false }),
      listing({ id: 'b.page.not-preinstalled', name: 'Page', preinstalled: false, page: true }),
    ]);
    expect(getPreinstalledPageAppTypes()).toEqual([typeForMarketplace('com.example.oem')]);
  });

  it('is empty on a build that bundles no preinstalled app (non-OEM)', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.example.page', name: 'Page', page: true })]);
    expect(getPreinstalledPageAppTypes()).toEqual([]);
  });
});

describe('isMarketplaceIdEnabled', () => {
  it('is false for an app with no listing', () => {
    expect(isMarketplaceIdEnabled('com.hellonexus.weather')).toBe(false);
  });

  it('is false for a general-purpose SDK app (not preinstalled)', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true })]);
    expect(isMarketplaceIdEnabled('com.hellonexus.weather')).toBe(false);
  });

  it('is false when preinstalled but page-less', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'a.preinstalled.nopage', name: 'NoPage', preinstalled: true, page: false })]);
    expect(isMarketplaceIdEnabled('a.preinstalled.nopage')).toBe(false);
  });

  it('is true for the OEM bake-in app on the machine it was bundled for', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true })]);
    expect(isMarketplaceIdEnabled('com.ibuypower.control')).toBe(true);
  });

  it('is true for an app the user installed from the store, page or not', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hyte.account', name: 'HYTE', source: 'user', page: true }),
      listing({ id: 'com.hellonexus.aquarium', name: 'Aquarium', source: 'user', page: false }),
    ]);
    expect(isMarketplaceIdEnabled('com.hyte.account')).toBe(true);
    expect(isMarketplaceIdEnabled('com.hellonexus.aquarium')).toBe(true);
  });
});
