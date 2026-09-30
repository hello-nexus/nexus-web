// An SDK app that declares `immersive` must get a Touch facet: PanelApp gates
// the fullscreen view on `Boolean(def.Touch) && meta.supportsImmersive[...]`,
// so the manifest flag alone leaves the menu entry hidden.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lookupApp, sizesForSurface } from './registry';
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

describe('SDK app grid sizes', () => {
  const sized = (id: string, gridSizes?: string[]) =>
    ({ ...base, id, sizes: ['2x2', '4x2', '2x4', '4x4', '2x2round'], defaultSize: '2x2', gridSizes } as unknown as AppInstalledListing);

  it('offers only its grid sizes where a panel holds several widgets, and each single-widget panel its own size', () => {
    _seedMarketplaceRegistryForTests([sized('com.example.grid', ['4x4'])]);
    const meta = lookupApp('app:com.example.grid')!.meta;
    for (const s of ['desktop', 'phone', 'y70', 'monitor'] as const) expect(sizesForSurface(meta, s, true), s).toEqual(['4x4']);
    expect(sizesForSurface(meta, 'q60')).toEqual(['2x4']);
    expect(sizesForSurface(meta, 'kraken')).toEqual(['2x2round']);
    expect(sizesForSurface(meta, 'lcd-round')).toEqual(['2x2round']);
    expect(sizesForSurface(meta, 'lcd-square')).toEqual(['2x2']);
    expect(sizesForSurface(meta, 'lcd-wide')).toEqual(['4x2']);
  });

  it('offers every size it declares when its grid sizes are unset, undeclared, or only single-widget sizes', () => {
    _seedMarketplaceRegistryForTests([
      sized('com.example.all'), sized('com.example.typo', ['8x8']), sized('com.example.single', ['2x4', '2x2round']),
    ]);
    for (const id of ['com.example.all', 'com.example.typo', 'com.example.single']) {
      expect(sizesForSurface(lookupApp(`app:${id}`)!.meta, 'desktop'), id).toEqual(['2x2', '4x2', '4x4']);
    }
  });
});
