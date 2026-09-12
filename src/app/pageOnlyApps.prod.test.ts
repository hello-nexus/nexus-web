import { describe, it, expect, vi } from 'vitest';

// DEV_TOOLS is `import.meta.env.DEV || __DEV_TOOLS__`, so it is true for the
// whole suite and the rest of the tests only ever cover the gate's open path.
// Mocking the module is how the release shape gets tested at all - the same
// trick providers.unofficial.test.ts uses for OFFICIAL_BUILD. Without this the
// store could leak back into a release build unnoticed.
vi.mock('../lib/devTools', () => ({ DEV_TOOLS: false }));

import { PAGE_ONLY_APPS, isPageOnlyAppKey } from './pageOnlyApps';
import { isPinnableAppKey, sanitizePinnedTail } from './sidebarAppKeys';

describe('page-only apps without dev tools', () => {
  it('does not register the store', () => {
    expect(PAGE_ONLY_APPS.store).toBeUndefined();
    expect(isPageOnlyAppKey('store')).toBe(false);
  });

  it('refuses to pin the store, and drops one already pinned', () => {
    expect(isPinnableAppKey('store')).toBe(false);
    expect(sanitizePinnedTail(['store'])).toEqual([]);
  });

  it('keeps frames registered and pinnable: it ships on release builds', () => {
    expect(isPageOnlyAppKey('frames')).toBe(true);
    expect(isPinnableAppKey('frames')).toBe(true);
    expect(sanitizePinnedTail(['frames'])).toEqual(['frames']);
  });
});
