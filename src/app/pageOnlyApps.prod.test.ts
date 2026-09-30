import { describe, it, expect, vi } from 'vitest';

// DEV_TOOLS is `import.meta.env.DEV || __DEV_TOOLS__`, so it is true for the
// whole suite and the rest of the tests only ever cover the gate's open path.
// Mocking the module is how the release shape gets tested at all - the same
// trick providers.unofficial.test.ts uses for OFFICIAL_BUILD. Without this,
// a release-only regression (an app gated behind dev tools again) goes unnoticed.
vi.mock('../lib/devTools', () => ({ DEV_TOOLS: false }));

import { PAGE_ONLY_APPS, isPageOnlyAppKey } from './pageOnlyApps';
import { isPinnableAppKey, sanitizePinnedTail } from './sidebarAppKeys';

describe('page-only apps without dev tools', () => {
  it('registers the store and pins it as the bottom default row: it ships on release builds', () => {
    expect(isPageOnlyAppKey('store')).toBe(true);
    expect(isPinnableAppKey('store')).toBe(true);
    expect(sanitizePinnedTail(['store'])).toEqual(['store']);
    expect(sanitizePinnedTail(undefined).at(-1)).toBe('store');
  });

  it('registers build and keeps it pinnable: it ships on release builds', () => {
    expect(PAGE_ONLY_APPS.build).toBeDefined();
    expect(isPageOnlyAppKey('build')).toBe(true);
    expect(isPinnableAppKey('build')).toBe(true);
    expect(sanitizePinnedTail(['build'])).toEqual(['build']);
  });

  it('keeps frames registered and pinnable: it ships on release builds', () => {
    expect(isPageOnlyAppKey('frames')).toBe(true);
    expect(isPinnableAppKey('frames')).toBe(true);
    expect(sanitizePinnedTail(['frames'])).toEqual(['frames']);
  });
});
