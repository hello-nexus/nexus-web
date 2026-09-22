// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppManifestCapabilities } from './types';
import type { AppInstalledListing } from './types';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
  getMarketplaceListing,
  getPreinstalledPageAppTypes,
  isMarketplaceIdEnabled,
  loadMarketplaceApps,
  reloadMarketplaceApps,
  typeForMarketplace,
} from './marketplaceRegistry';
import { listInstalledApps } from './api';

vi.mock('./api', () => ({ listInstalledApps: vi.fn() }));
const mockList = vi.mocked(listInstalledApps);

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

afterEach(() => { _resetMarketplaceRegistryForTests(); vi.clearAllMocks(); });

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

describe('reloadMarketplaceApps', () => {
  // The service broadcasts after the install lands, so a read already in flight
  // may have been issued before it. Joining that read reports the app missing,
  // and a layout normalized against it drops the placement.
  it('issues its own read instead of joining one already in flight', async () => {
    let releaseFirst: (apps: AppInstalledListing[]) => void = () => {};
    mockList.mockReturnValueOnce(new Promise<AppInstalledListing[]>(resolve => { releaseFirst = resolve; }));
    mockList.mockResolvedValueOnce([listing({ id: 'com.hellonexus.ina', name: 'Ina', source: 'user' })]);

    const inFlight = loadMarketplaceApps();
    const reload = reloadMarketplaceApps();
    releaseFirst([]);
    await inFlight;

    expect(await reload).toBe(true);
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(getMarketplaceListing('com.hellonexus.ina')).toBeTruthy();
  });

  it('coalescing is what it works around: two plain loads share one read', async () => {
    mockList.mockResolvedValue([]);

    await Promise.all([loadMarketplaceApps(), loadMarketplaceApps()]);

    expect(mockList).toHaveBeenCalledTimes(1);
  });

  // Several subscribers react to one apps/changed frame; they want one read
  // between them, not one each.
  it('reloads prompted together share one read', async () => {
    mockList.mockResolvedValue([]);

    const [a, b] = await Promise.all([reloadMarketplaceApps(), reloadMarketplaceApps()]);

    expect(mockList).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual([true, true]);
  });

  // The caller refetches its layout on the strength of this answer, so a failed
  // read must report false rather than resolve like a success.
  it('reports false when the read failed, leaving the cache intact', async () => {
    _seedMarketplaceRegistryForTests([listing({ id: 'com.hellonexus.ina', name: 'Ina', source: 'user' })]);
    mockList.mockRejectedValueOnce(new Error('offline'));

    expect(await reloadMarketplaceApps()).toBe(false);
    expect(getMarketplaceListing('com.hellonexus.ina')).toBeTruthy();
  });
});
