import { describe, expect, it } from 'vitest';
import { isSyncPassSettled } from './syncProfileRows';

describe('isSyncPassSettled', () => {
  it('is settled for every non-syncing state', () => {
    expect(isSyncPassSettled('idle')).toBe(true);
    expect(isSyncPassSettled('dirty')).toBe(true);
    expect(isSyncPassSettled('error')).toBe(true);
    expect(isSyncPassSettled('offline')).toBe(true);
  });

  it('is not settled while the pass is syncing', () => {
    expect(isSyncPassSettled('syncing')).toBe(false);
  });
});
