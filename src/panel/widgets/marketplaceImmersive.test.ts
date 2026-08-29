// An SDK app that declares `immersive` must get a Touch facet: PanelApp gates
// the fullscreen view on `Boolean(def.Touch) && meta.supportsImmersive[...]`,
// so the manifest flag alone leaves the menu entry hidden.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lookupApp } from './registry';
import {
  _seedMarketplaceRegistryForTests,
  _resetMarketplaceRegistryForTests,
} from '../../widgets/marketplaceRegistry';
import type { AppInstalledListing } from '../../widgets/types';

const base = {
  name: 'App', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk',
  page: false, capabilities: {}, sizes: ['2x2', '4x2', '4x4'], defaultSize: '4x2',
  source: 'user', preinstalled: false,
};
const listing = (id: string, immersive: boolean) =>
  ({ ...base, id, immersive } as unknown as AppInstalledListing);

beforeEach(() => _resetMarketplaceRegistryForTests());
afterEach(() => _resetMarketplaceRegistryForTests());

describe('SDK app immersive facet', () => {
  it('gets a Touch view and both orientations when it declares immersive', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.imm', true)]);
    const def = lookupApp('app:com.example.imm');
    expect(def?.Touch, 'immersive app must expose a Touch facet').toBeTruthy();
    expect(def?.meta.supportsImmersive).toEqual({ portrait: true, landscape: true });
  });

  it('gets neither when it does not', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.plain', false)]);
    const def = lookupApp('app:com.example.plain');
    expect(def?.Touch).toBeUndefined();
    expect(def?.meta.supportsImmersive).toEqual({ portrait: false, landscape: false });
  });

  it('reuses one adapter component so the sandbox is not remounted per render', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.imm', true)]);
    expect(lookupApp('app:com.example.imm')?.Touch).toBe(lookupApp('app:com.example.imm')?.Touch);
  });
});
