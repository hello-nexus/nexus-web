import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSidebarAppMeta } from './sidebarApps';
import { AppIconImage } from '../components/icons/AppIconImage';
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
    trusted: true,
    ...over,
  };
}

afterEach(() => _resetMarketplaceRegistryForTests());

describe('getSidebarAppMeta - preinstalled OEM icon', () => {
  it('renders the app manifest icon for a preinstalled app', () => {
    _seedMarketplaceRegistryForTests([
      listing({
        id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true,
        iconUrl: '/apps-api/installed/com.ibuypower.control/asset/assets/mark.svg',
      }),
    ]);
    const meta = getSidebarAppMeta(typeForMarketplace('com.ibuypower.control'));
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).toBe(AppIconImage);
  });

  it('leaves a non-preinstalled page app on the generic marketplace glyph', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true, iconUrl: '/x.svg' }),
    ]);
    const meta = getSidebarAppMeta(typeForMarketplace('com.hellonexus.weather'));
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).not.toBe(AppIconImage);
  });

  it('leaves a built-in app (e.g. clock) untouched', () => {
    const meta = getSidebarAppMeta('clock');
    expect(meta).not.toBeNull();
    expect((meta!.icon as ReactElement).type).not.toBe(AppIconImage);
  });
});
