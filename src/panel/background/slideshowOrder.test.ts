// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { orderBackgroundMedia, slideshowLap } from './slideshowOrder';

const item = (id: string, importedAtUnixMs: number): BackgroundMediaItem => ({
  id, name: id, sourceExt: '.jpg', type: 'static', width: 1, height: 1, importedAtUnixMs, durationSec: 0, alpha: false,
});
// The service lists newest first.
const library = [item('c', 3), item('b', 2), item('a', 1)];
const ids = (lap: BackgroundMediaItem[]) => lap.map(i => i.id);
const ordered = orderBackgroundMedia(library, []);

describe('orderBackgroundMedia', () => {
  it('defaults to import order', () => {
    expect(ids(ordered)).toEqual(['a', 'b', 'c']);
  });

  it('puts the saved order first and unlisted imports after it, oldest first', () => {
    expect(ids(orderBackgroundMedia([...library, item('d', 4)], ['c', 'a']))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores saved ids that are no longer in the library', () => {
    expect(ids(orderBackgroundMedia(library, ['zz', 'b']))).toEqual(['b', 'a', 'c']);
  });
});

describe('slideshowLap', () => {
  it('walks the display order', () => {
    expect(ids(slideshowLap(ordered, false, null))).toEqual(['a', 'b', 'c']);
  });

  it('opens on the selected slide and wraps', () => {
    expect(ids(slideshowLap(ordered, false, 'b'))).toEqual(['b', 'c', 'a']);
  });

  it('ignores a selected slide that is not in the library', () => {
    expect(ids(slideshowLap(ordered, false, 'zz'))).toEqual(['a', 'b', 'c']);
  });

  it('returns fewer than two items as they are', () => {
    expect(ids(slideshowLap([item('a', 1)], true, null))).toEqual(['a']);
    expect(slideshowLap([], false, null)).toEqual([]);
  });

  it('continues an in-order lap after the slide just shown', () => {
    expect(ids(slideshowLap(ordered, false, null, 'a'))).toEqual(['b', 'c', 'a']);
    expect(ids(slideshowLap(ordered, false, null, 'c'))).toEqual(['a', 'b', 'c']);
  });

  it('shuffles every item exactly once and leads with the selected slide', () => {
    const lap = slideshowLap(ordered, true, 'a', null, () => 0.99);
    expect(lap[0].id).toBe('a');
    expect(ids(lap).sort()).toEqual(['a', 'b', 'c']);
  });

  it('never opens a fresh shuffled lap on the slide just shown', () => {
    // random() = 0 leaves the order untouched, so the lap would open on 'a'.
    const lap = slideshowLap(ordered, true, null, 'a', () => 0);
    expect(lap[0].id).not.toBe('a');
    expect(ids(lap).sort()).toEqual(['a', 'b', 'c']);
  });
});
