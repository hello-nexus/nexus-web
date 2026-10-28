// An SDK app that declares `freeform` resizes to any span, like Web View; one that does not keeps its declared sizes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lookupApp, sizesForSurface } from './registry';
import { freeformSnapSpans } from '../engine/freeformResize';
import { snapLegacySize } from '../engine/legacySize';
import {
  _seedMarketplaceRegistryForTests,
  _resetMarketplaceRegistryForTests,
} from '../../widgets/marketplaceRegistry';
import type { AppInstalledListing } from '../../widgets/types';

const base = {
  name: 'App', version: '1.0.0', surfaces: ['dashboard'], runtime: 'sdk',
  page: false, capabilities: {}, sizes: ['2x2', '4x2', '2x4', '4x4', '2x2round'], defaultSize: '4x4',
  source: 'user', preinstalled: false,
};
const listing = (id: string, freeform?: boolean) => ({ ...base, id, freeform } as unknown as AppInstalledListing);
const bounds = { cols: 8, rows: 6 };

beforeEach(() => _resetMarketplaceRegistryForTests());
afterEach(() => _resetMarketplaceRegistryForTests());

describe('SDK app freeform', () => {
  it('gets every span the grid holds when its manifest declares freeform', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.free', true)]);
    const meta = lookupApp('app:com.example.free')!.meta;
    expect(meta.freeform).toBe(true);
    const spans = freeformSnapSpans(sizesForSurface(meta, 'monitor', true), bounds, Boolean(meta.freeform));
    expect(spans).toContainEqual({ cols: 6, rows: 4 });
    expect(spans).toContainEqual({ cols: 8, rows: 6 });
    expect(snapLegacySize('app:com.example.free', '6x4', undefined)).toBe('6x4');
  });

  it('keeps its declared sizes when it does not', () => {
    _seedMarketplaceRegistryForTests([listing('com.example.plain'), listing('com.example.off', false)]);
    for (const id of ['com.example.plain', 'com.example.off']) {
      const meta = lookupApp(`app:${id}`)!.meta;
      expect(meta.freeform, id).toBeUndefined();
      const spans = freeformSnapSpans(sizesForSurface(meta, 'monitor', true), bounds, Boolean(meta.freeform));
      expect(spans, id).not.toContainEqual({ cols: 6, rows: 4 });
    }
  });
});
