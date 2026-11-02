import { describe, expect, it } from 'vitest';
import { pinAtRenderedIndex, stripBuildFromArrangement, withBuildRow } from './buildEntry';
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

describe('arrangement helpers', () => {
  it('strips Build from both zones so neighbours keep their dropped order', () => {
    expect(stripBuildFromArrangement({ pinned: ['monitoring', 'diagnostics', 'app', 'build', 'store'], lower: ['build', 'frames'] }))
      .toEqual({ pinned: ['monitoring', 'diagnostics', 'app', 'store'], lower: ['frames'] });
  });

  it('pins at a rendered index that counts the Build row', () => {
    const tail = ['monitoring', 'diagnostics', 'store'];
    // rendered: monitoring, diagnostics, build, store; index 3 is between Build and store.
    expect(pinAtRenderedIndex(tail, 'app', 3)).toEqual(['monitoring', 'diagnostics', 'app', 'store']);
    // index 1 is between monitoring and diagnostics.
    expect(pinAtRenderedIndex(tail, 'app', 1)).toEqual(['monitoring', 'app', 'diagnostics', 'store']);
  });
});
