// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { normalizeAppType } from '../widgets/marketplaceRegistry';
import { appendRecent, sanitizeAppOrder, sanitizePinnedTail, sanitizeRecents } from './sidebarAppKeys';

const registryState = vi.hoisted(() => ({ loaded: true }));

vi.mock('../panel/widgets/registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../panel/widgets/registry')>();
  return {
    ...actual,
    lookupApp: (type: string) =>
      type === 'app:com.test.pageapp'
        ? ({ Page: () => null } as never)
        : actual.lookupApp(type),
  };
});

vi.mock('../widgets/marketplaceRegistry', async importOriginal => {
  const actual = await importOriginal<typeof import('../widgets/marketplaceRegistry')>();
  return {
    ...actual,
    hasMarketplaceLoadedOnce: () => registryState.loaded,
  };
});

describe('normalizeAppType', () => {
  it('rewrites the legacy prefix and passes everything else through', () => {
    expect(normalizeAppType('marketplace:com.ibuypower.control')).toBe('app:com.ibuypower.control');
    expect(normalizeAppType('app:com.ibuypower.control')).toBe('app:com.ibuypower.control');
    expect(normalizeAppType('monitoring')).toBe('monitoring');
  });
});

describe('sanitizePinnedTail legacy keys', () => {
  // The pinned tail lives in client storage, so the server-side v11 prefix
  // migration never sees it; the sanitizer must rewrite instead of dropping,
  // or every pre-rename pin (the OEM bake-in) is silently lost.
  it('rewrites a legacy marketplace: pin for a page-capable app', () => {
    expect(sanitizePinnedTail(['monitoring', 'marketplace:com.test.pageapp']))
      .toEqual(['monitoring', 'app:com.test.pageapp']);
  });

  it('dedupes across legacy and new forms of the same pin', () => {
    expect(sanitizePinnedTail(['marketplace:com.test.pageapp', 'app:com.test.pageapp']))
      .toEqual(['app:com.test.pageapp']);
  });

  it('drops unknown keys after normalization once the registry has loaded', () => {
    registryState.loaded = true;
    expect(sanitizePinnedTail(['marketplace:com.gone.app', 'monitoring']))
      .toEqual(['monitoring']);
  });

  it('preserves unconfirmed app keys, normalized, while the registry is loading', () => {
    registryState.loaded = false;
    try {
      expect(sanitizePinnedTail(['marketplace:com.maybe.app', 'monitoring']))
        .toEqual(['app:com.maybe.app', 'monitoring']);
    } finally {
      registryState.loaded = true;
    }
  });
});

describe('sanitizeRecents', () => {
  it('rewrites the legacy marketplace: prefix for a page-capable app', () => {
    expect(sanitizeRecents(['monitoring', 'marketplace:com.test.pageapp']))
      .toEqual(['app:com.test.pageapp']);
  });

  it('drops unknown keys once the registry has loaded', () => {
    expect(sanitizeRecents(['monitoring', 'marketplace:com.gone.app']))
      .toEqual(['monitoring']);
  });

  it('dedupes before capping', () => {
    expect(sanitizeRecents(['lighting', 'monitoring', 'monitoring']))
      .toEqual(['monitoring']);
  });

  it('caps to the last entry - the newest', () => {
    expect(sanitizeRecents(['monitoring', 'lighting', 'cooling', 'clock']))
      .toEqual(['clock']);
  });

  it('returns an empty array for undefined or non-array input', () => {
    expect(sanitizeRecents(undefined)).toEqual([]);
  });
});

describe('appendRecent', () => {
  it('replaces the entry with a newly opened key', () => {
    expect(appendRecent(['monitoring'], 'lighting')).toEqual(['lighting']);
  });

  it('is a no-op (same reference) when the key is already present', () => {
    const list = ['monitoring'];
    expect(appendRecent(list, 'monitoring')).toBe(list);
  });
});

describe('sanitizeAppOrder', () => {
  it('rewrites the legacy prefix, dedupes, and keeps unknown keys', () => {
    expect(sanitizeAppOrder(['weather', 'marketplace:com.gone.app', 'weather', 3]))
      .toEqual(['weather', 'app:com.gone.app']);
  });

  it('returns an empty array for undefined input', () => {
    expect(sanitizeAppOrder(undefined)).toEqual([]);
  });
});
