// An installed SDK app must resolve on EVERY surface, not just the embedded
// desktop dashboard. The registry load used to ride the OEM-seed hook's
// `enabled` gate (desktop-only), so on a panel lookupApp('app:<id>') returned
// undefined, the widget had no component, and the cell rendered blank - an app
// could be added to a panel and would simply never appear.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../widgets/api', () => ({ listInstalledApps: vi.fn() }));

import { listInstalledApps } from '../../widgets/api';
import { useOemAppSeed } from './useOemAppSeed';
import { lookupApp } from '../widgets/registry';
import { _resetMarketplaceRegistryForTests } from '../../widgets/marketplaceRegistry';

const LISTING = {
  id: 'com.hellonexus.aquarium', name: 'Aquarium', version: '1.0.0',
  surfaces: ['dashboard'], runtime: 'sdk', page: false,
  capabilities: {}, sizes: ['2x2', '4x2', '4x4'], defaultSize: '4x2',
  source: 'user', preinstalled: false,
};

function seedArgs(enabled: boolean) {
  return {
    enabled,
    layoutLoaded: true,
    layout: { layoutSchemaVersion: 2, surface: 'y70', pages: [] },
    setLayout: vi.fn(),
    capacity: { gridCols: 4, pageRows: 14 },
    uiHydrated: true,
    uiSettings: {},
    updateUiSettings: vi.fn(),
  } as unknown as Parameters<typeof useOemAppSeed>[0];
}

const mockList = vi.mocked(listInstalledApps);

beforeEach(() => { _resetMarketplaceRegistryForTests(); mockList.mockResolvedValue([LISTING] as never); });
afterEach(() => { _resetMarketplaceRegistryForTests(); vi.clearAllMocks(); });

describe('marketplace registry on panel surfaces', () => {
  it('loads the registry even when the OEM seed is disabled (any panel)', async () => {
    expect(lookupApp('app:com.hellonexus.aquarium')).toBeUndefined();
    renderHook(() => useOemAppSeed(seedArgs(false)));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        lookupApp('app:com.hellonexus.aquarium'),
        'an installed SDK app must resolve on a panel, or its cell renders blank',
      ).toBeDefined();
    });
  });

  it('still loads it on the desktop dashboard', async () => {
    renderHook(() => useOemAppSeed(seedArgs(true)));
    await waitFor(() => expect(lookupApp('app:com.hellonexus.aquarium')).toBeDefined());
  });
});
