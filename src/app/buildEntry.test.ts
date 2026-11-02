import { describe, expect, it } from 'vitest';
import { withBuildRow } from './buildEntry';
import { sanitizeAppOrder } from './sidebarAppKeys';

describe('withBuildRow', () => {
  it('slots Build right after Diagnostics and before the Marketplace row', () => {
    expect(withBuildRow(['monitoring', 'lighting', 'cooling', 'diagnostics', 'store']))
      .toEqual(['monitoring', 'lighting', 'cooling', 'diagnostics', 'build', 'store']);
  });

  it('follows the last pinned pillar when Diagnostics is unpinned', () => {
    expect(withBuildRow(['monitoring', 'lighting', 'store']))
      .toEqual(['monitoring', 'lighting', 'build', 'store']);
  });

  it('leads the tail when no pillar is pinned', () => {
    expect(withBuildRow(['store'])).toEqual(['build', 'store']);
  });

  it('never duplicates a stored build pin', () => {
    expect(withBuildRow(['build', 'monitoring', 'diagnostics', 'store']))
      .toEqual(['monitoring', 'diagnostics', 'build', 'store']);
  });
});

describe('sanitizeAppOrder', () => {
  it('drops a stored build slot', () => {
    expect(sanitizeAppOrder(['frames', 'build', 'settings'])).toEqual(['frames', 'settings']);
  });
});
