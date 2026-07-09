import { describe, expect, it, vi } from 'vitest';
import { normalizeAppType } from '../widgets/marketplaceRegistry';
import { sanitizePinnedTail } from './sidebarAppKeys';

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

  it('still drops unknown keys after normalization', () => {
    expect(sanitizePinnedTail(['marketplace:com.gone.app', 'monitoring']))
      .toEqual(['monitoring']);
  });
});
