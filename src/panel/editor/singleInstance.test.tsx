// A widget may declare that only one instance belongs on a panel. Default stays
// "as many as you like", which is what every built-in has always done.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lookupApp } from '../widgets/registry';
import {
  _seedMarketplaceRegistryForTests,
  _resetMarketplaceRegistryForTests,
} from '../../widgets/marketplaceRegistry';
import type { AppInstalledListing } from '../../widgets/types';

const base = {
  name: 'App', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk',
  page: false, capabilities: {}, sizes: ['2x2', '4x2'], defaultSize: '4x2',
  source: 'user', preinstalled: false,
};
const listing = (id: string, singleInstance?: boolean) =>
  ({ ...base, id, singleInstance } as unknown as AppInstalledListing);

/** Mirrors the catalog's gate. */
const addable = (type: string, placed: string[]) => {
  const def = lookupApp(type);
  return !(def?.meta.singleInstance && placed.includes(type));
};

beforeEach(() => _resetMarketplaceRegistryForTests());
afterEach(() => _resetMarketplaceRegistryForTests());

describe('single-instance widgets', () => {
  it('blocks a second copy once one is placed', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.solo', true)]);
    expect(addable('app:com.example.solo', [])).toBe(true);
    expect(addable('app:com.example.solo', ['app:com.example.solo'])).toBe(false);
  });

  it('leaves every other widget alone, however many are placed', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.many', false)]);
    const placed = ['app:com.example.many', 'app:com.example.many'];
    expect(addable('app:com.example.many', placed)).toBe(true);
  });

  it('defaults to allowing multiple when the app says nothing', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.quiet')]);
    expect(lookupApp('app:com.example.quiet')?.meta.singleInstance).toBeFalsy();
    expect(addable('app:com.example.quiet', ['app:com.example.quiet'])).toBe(true);
  });

  it('is per panel, not per page: a type on any page counts', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.solo', true)]);
    const acrossPages = ['clock', 'app:com.example.solo'];
    expect(addable('app:com.example.solo', acrossPages)).toBe(false);
  });
});
