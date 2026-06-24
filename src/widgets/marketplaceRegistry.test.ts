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
    trusted: true,
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
  it('enables an allowlisted app', () => {
    expect(isMarketplaceIdEnabled('com.hellonexus.weather')).toBe(true);
  });

  it('does not enable a non-allowlisted app even when preinstalled (OEM bake-in)', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true })]);
    expect(isMarketplaceIdEnabled('com.ibuypower.control')).toBe(false);
  });
});
