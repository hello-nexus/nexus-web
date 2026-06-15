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
  it('enables a preinstalled app so a removed copy can be re-added', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.example.oem', name: 'OEM App', preinstalled: true, page: true })]);
    expect(isMarketplaceIdEnabled('com.example.oem')).toBe(true);
  });

  it('does not enable an unknown, non-preinstalled app', () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.example.other', name: 'Other', preinstalled: false })]);
    expect(isMarketplaceIdEnabled('com.example.other')).toBe(false);
  });
});
