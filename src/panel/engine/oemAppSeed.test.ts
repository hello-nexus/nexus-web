import { describe, expect, it } from 'vitest';
import { hasOemApp, planOemAppSeed } from './oemAppSeed';
import type { AppInstalledListing, AppManifestCapabilities } from '../../widgets/types';
import type { PanelLayout } from '../types';

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

function layout(widgetTypes: string[]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'desktop',
    pages: [{
      id: 'page-0',
      widgets: widgetTypes.map((type, i) => ({
        id: `w${i}`, type, size: '4x2', col: 0, row: i,
      })),
    }],
  };
}

describe('hasOemApp', () => {
  it('is false with no listings', () => {
    expect(hasOemApp([])).toBe(false);
  });

  it('is false when nothing is both preinstalled and page-capable', () => {
    expect(hasOemApp([
      listing({ id: 'a', preinstalled: true, page: false }),
      listing({ id: 'b', preinstalled: false, page: true }),
    ])).toBe(false);
  });

  it('is true for a preinstalled page app', () => {
    expect(hasOemApp([listing({ id: 'com.ibuypower.control', preinstalled: true, page: true })])).toBe(true);
  });
});

describe('planOemAppSeed', () => {
  it('plans both the widget and the sidebar pin when neither is present', () => {
    const plan = planOemAppSeed(
      [listing({ id: 'com.ibuypower.control', preinstalled: true, page: true })],
      layout([]),
      [],
    );
    expect(plan.widgetTypesToAdd).toEqual(['app:com.ibuypower.control']);
    expect(plan.sidebarKeysToAdd).toEqual(['app:com.ibuypower.control']);
  });

  it('is idempotent once the widget and pin already exist', () => {
    const plan = planOemAppSeed(
      [listing({ id: 'com.ibuypower.control', preinstalled: true, page: true })],
      layout(['app:com.ibuypower.control']),
      ['app:com.ibuypower.control'],
    );
    expect(plan.widgetTypesToAdd).toEqual([]);
    expect(plan.sidebarKeysToAdd).toEqual([]);
  });

  it('plans only the missing half when the user removed just one of the two', () => {
    const withWidgetOnly = planOemAppSeed(
      [listing({ id: 'com.ibuypower.control', preinstalled: true, page: true })],
      layout(['app:com.ibuypower.control']),
      [],
    );
    expect(withWidgetOnly.widgetTypesToAdd).toEqual([]);
    expect(withWidgetOnly.sidebarKeysToAdd).toEqual(['app:com.ibuypower.control']);
  });

  it('ignores non-preinstalled or page-less listings', () => {
    const plan = planOemAppSeed(
      [
        listing({ id: 'com.hellonexus.weather', preinstalled: false, page: true }),
        listing({ id: 'a.preinstalled.nopage', preinstalled: true, page: false }),
      ],
      layout([]),
      [],
    );
    expect(plan.widgetTypesToAdd).toEqual([]);
    expect(plan.sidebarKeysToAdd).toEqual([]);
  });
});
