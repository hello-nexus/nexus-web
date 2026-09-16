// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SLIDESHOW_INTERVALS, normalizeSlideshowInterval, shuffledLap, slideshowIntervalLabel } from './slideshow';

const t = (key: string, vars?: Record<string, string | number>) => `${key}:${vars?.count}`;

describe('slideshow intervals', () => {
  it('runs 5 s to 1 h', () => {
    expect(SLIDESHOW_INTERVALS).toEqual([5, 10, 15, 30, 60, 180, 300, 900, 1800, 3600]);
  });

  it('snaps stored values to the nearest option and falls back when unusable', () => {
    expect(normalizeSlideshowInterval(700, 30)).toBe(900);
    expect(normalizeSlideshowInterval(86400, 30)).toBe(3600);
    expect(normalizeSlideshowInterval(0, 30)).toBe(30);
    expect(normalizeSlideshowInterval(undefined, 10)).toBe(10);
  });

  it('labels in the largest whole unit with the plural form', () => {
    expect(slideshowIntervalLabel(t, 'en', 15)).toBe('slideshow.seconds.other:15');
    expect(slideshowIntervalLabel(t, 'en', 60)).toBe('slideshow.minutes.one:1');
    expect(slideshowIntervalLabel(t, 'en', 180)).toBe('slideshow.minutes.other:3');
    expect(slideshowIntervalLabel(t, 'pl', 180)).toBe('slideshow.minutes.few:3');
    expect(slideshowIntervalLabel(t, 'en', 3600)).toBe('slideshow.hours.one:1');
  });
});

describe('shuffledLap', () => {
  it('visits every item once', () => {
    expect(shuffledLap([1, 2, 3, 4], null, () => 0.99).sort()).toEqual([1, 2, 3, 4]);
  });

  it('never leads with the item just shown', () => {
    // random() = 0 keeps the input order, so the lap would open on 1.
    expect(shuffledLap([1, 2, 3], 1, () => 0)[0]).not.toBe(1);
    expect(shuffledLap([1], 1, () => 0)).toEqual([1]);
  });
});
