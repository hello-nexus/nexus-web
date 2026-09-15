// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { slideshowLap } from './slideshowOrder';

const item = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  id, name: id, sourceExt: '.jpg', type: 'static', width: 1, height: 1, importedAtUnixMs, durationSec: 0, alpha: false,
});
// The library lists newest first.
const library = [item('c', 3), item('b', 2), item('a', 1)];
const ids = (lap: BackgroundMediaItem[]) => lap.map(i => i.id);

describe('slideshowLap', () => {
  it('walks the library in import order', () => {
    expect(ids(slideshowLap(library, false, null))).toEqual(['a', 'b', 'c']);
  });

  it('opens on the selected slide and wraps', () => {
    expect(ids(slideshowLap(library, false, 'b'))).toEqual(['b', 'c', 'a']);
  });

  it('ignores a selected slide that is not in the library', () => {
    expect(ids(slideshowLap(library, false, 'zz'))).toEqual(['a', 'b', 'c']);
  });

  it('returns fewer than two items as they are', () => {
    expect(ids(slideshowLap([item('a', 1)], true, null))).toEqual(['a']);
    expect(slideshowLap([], false, null)).toEqual([]);
  });

  it('shuffles every item exactly once and leads with the selected slide', () => {
    const lap = slideshowLap(library, true, 'a', null, () => 0.99);
    expect(lap[0].id).toBe('a');
    expect(ids(lap).sort()).toEqual(['a', 'b', 'c']);
  });

  it('never opens a fresh shuffled lap on the slide just shown', () => {
    // random() = 0 leaves the order untouched, so the lap would open on 'a'.
    const lap = slideshowLap(library, true, null, 'a', () => 0);
    expect(lap[0].id).not.toBe('a');
    expect(ids(lap).sort()).toEqual(['a', 'b', 'c']);
  });
});
