import { describe, it, expect, vi } from 'vitest';

// DEV_TOOLS is `import.meta.env.DEV || __DEV_TOOLS__`, so it is true for the
// whole suite and the rest of the tests only ever cover the gate's open path.
// Mocking the module is how the release shape gets tested at all - the same
// trick providers.unofficial.test.ts uses for OFFICIAL_BUILD.
vi.mock('../lib/devTools', () => ({ DEV_TOOLS: false }));

import { PAGE_ONLY_APPS, isPageOnlyAppKey } from './pageOnlyApps';
import { isPinnableAppKey, sanitizePinnedTail } from './sidebarAppKeys';
import { isDashboardClickthroughType } from '../panel/engine/panelLayoutHelpers';
import { catalogEntriesFor } from '../panel/editor/PanelWidgetCatalog';
import { listSidebarAppKeys } from './sidebarApps';

describe('page-only apps without dev tools', () => {
  it('registers the store and pins it as the bottom default row: it ships on release builds', () => {
    expect(isPageOnlyAppKey('store')).toBe(true);
    expect(isPinnableAppKey('store')).toBe(true);
    expect(sanitizePinnedTail(['store'])).toEqual(['store']);
    expect(sanitizePinnedTail(undefined).at(-1)).toBe('store');
  });

  it('does not register build: it is dev-tools only, so no sidebar row, pin or search entry', () => {
    expect(PAGE_ONLY_APPS.build).toBeUndefined();
    expect(isPageOnlyAppKey('build')).toBe(false);
    expect(isPinnableAppKey('build')).toBe(false);
    expect(sanitizePinnedTail(['build'])).not.toContain('build');
    expect(isDashboardClickthroughType('build')).toBe(false);
    expect(listSidebarAppKeys()).not.toContain('build');
    expect(catalogEntriesFor('desktop').map(([type]) => type)).not.toContain('build');
  });

  it('keeps frames registered and pinnable: it ships on release builds', () => {
    expect(isPageOnlyAppKey('frames')).toBe(true);
    expect(isPinnableAppKey('frames')).toBe(true);
    expect(sanitizePinnedTail(['frames'])).toEqual(['frames']);
  });
});
