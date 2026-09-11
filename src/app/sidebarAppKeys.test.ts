// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { normalizeAppType } from '../widgets/marketplaceRegistry';
import { appendRecent, sanitizePinnedTail, sanitizeRecents } from './sidebarAppKeys';

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
      .toEqual(['monitoring', 'app:com.test.pageapp']);
  });

  it('drops unknown keys once the registry has loaded', () => {
    expect(sanitizeRecents(['marketplace:com.gone.app', 'monitoring']))
      .toEqual(['monitoring']);
  });

  it('dedupes while preserving first-occurrence order', () => {
    expect(sanitizeRecents(['monitoring', 'lighting', 'monitoring']))
      .toEqual(['monitoring', 'lighting']);
  });

  it('caps to the last 2 entries - the newest - in input order', () => {
    expect(sanitizeRecents(['monitoring', 'lighting', 'cooling', 'clock']))
      .toEqual(['cooling', 'clock']);
  });

  it('returns an empty array for undefined or non-array input', () => {
    expect(sanitizeRecents(undefined)).toEqual([]);
  });
});

describe('appendRecent', () => {
  it('appends a new key at the end', () => {
    expect(appendRecent(['monitoring'], 'lighting')).toEqual(['monitoring', 'lighting']);
  });

  it('is a no-op (same order, same reference) when the key is already present', () => {
    const list = ['monitoring', 'lighting'];
    const next = appendRecent(list, 'monitoring');
    expect(next).toBe(list);
    expect(next).toEqual(['monitoring', 'lighting']);
  });

  it('evicts the oldest (index 0) once the list would exceed the cap of 2', () => {
    expect(appendRecent(['monitoring', 'lighting'], 'cooling'))
      .toEqual(['lighting', 'cooling']);
  });

  it('never moves an existing entry, even one about to be evicted by a different append', () => {
    // Re-opening 'monitoring' does not move it to the end - eviction order is
    // purely first-insertion order, not recency of re-open.
    const list = ['monitoring', 'lighting'];
    expect(appendRecent(list, 'monitoring')).toEqual(['monitoring', 'lighting']);
  });
});
