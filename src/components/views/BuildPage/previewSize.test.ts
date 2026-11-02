import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreviewSize, isStaleSize, mayRedraw, previewSizeFor, REDRAW_INTERVAL_MS, registerPreviewSize, resetPreviewSize, unregisterPreviewSize } from './previewSize';

afterEach(() => resetPreviewSize());

describe('previewSizeFor', () => {
  it('is the box in device pixels over the share of the image the drawing fills', () => {
    expect(previewSizeFor(120, 2)).toBe(267);
    expect(previewSizeFor(120, 1)).toBe(134);
  });

  it('clamps to a range a canvas can draw', () => {
    expect(previewSizeFor(10, 1)).toBe(128);
    expect(previewSizeFor(5000, 3)).toBe(2048);
  });

  it('is null for a box without width and treats a bad ratio as 1', () => {
    expect(previewSizeFor(0, 2)).toBeNull();
    expect(previewSizeFor(Number.NaN, 2)).toBeNull();
    expect(previewSizeFor(120, 0)).toBe(134);
  });
});

describe('isStaleSize', () => {
  it('replaces an image that is too small, and keeps any larger one: sizes only grow', () => {
    expect(isStaleSize(270, 270)).toBe(false);
    expect(isStaleSize(250, 270)).toBe(false);
    expect(isStaleSize(540, 270)).toBe(false);
    expect(isStaleSize(1500, 270 )).toBe(false);
    expect(isStaleSize(200, 270)).toBe(true);
  });

  it('replaces the unsized default image where a smaller one is wanted, and keeps it where it is about right', () => {
    expect(isStaleSize(1024, 270)).toBe(true);
    expect(isStaleSize(1024, 900)).toBe(true);
    expect(isStaleSize(1024, 1000)).toBe(false);
  });
});

describe('mayRedraw', () => {
  it('allows a first attempt and then one per interval', () => {
    expect(mayRedraw(undefined, 5)).toBe(true);
    expect(mayRedraw(1000, 1000 + REDRAW_INTERVAL_MS - 1)).toBe(false);
    expect(mayRedraw(1000, 1000 + REDRAW_INTERVAL_MS)).toBe(true);
  });
});

describe('two contexts that want different sizes', () => {
  // Each context redraws a stored image that is too small for it, no more than once per interval, and saves at the size it wants.
  function simulate(minutes: number, foreignSaves: Set<number>) {
    const contexts = [{ wanted: 270, last: undefined as number | undefined, redraws: 0 }, { wanted: 600, last: undefined as number | undefined, redraws: 0 }];
    let stored = 1024;
    for (let minute = 0; minute < minutes; minute++) {
      const now = minute * 60_000;
      if (foreignSaves.has(minute)) stored = 270;
      for (const c of contexts) {
        if (isStaleSize(stored, c.wanted) && mayRedraw(c.last, now)) {
          c.last = now;
          c.redraws += 1;
          stored = c.wanted;
        }
      }
    }
    return { stored, redraws: contexts.map((c) => c.redraws) };
  }

  it('settles on the larger size with a bounded number of redraws', () => {
    const { stored, redraws } = simulate(180, new Set());
    expect(stored).toBe(600);
    expect(redraws[0]).toBeLessThanOrEqual(1);
    expect(redraws[1]).toBe(1);
  });

  it('corrects a smaller save from elsewhere later, never in a tight loop', () => {
    // A save at the smaller size every 7 minutes for 3 hours.
    const saves = new Set(Array.from({ length: 25 }, (_, i) => 7 * (i + 1)));
    const { redraws, stored } = simulate(180, saves);
    expect(redraws[1]).toBeLessThanOrEqual(Math.ceil(180 / (REDRAW_INTERVAL_MS / 60_000)) + 1);
    expect(stored).toBeGreaterThanOrEqual(270);
  });
});

describe('the shared size', () => {
  it('starts unknown and takes the first measurement', () => {
    expect(getPreviewSize()).toBeNull();
    registerPreviewSize('a', null);
    expect(getPreviewSize()).toBeNull();
    registerPreviewSize('a', 270);
    expect(getPreviewSize()).toBe(270);
  });

  it('ignores a change inside the settle band and takes a real one', () => {
    registerPreviewSize('a', 270);
    registerPreviewSize('a', 278);
    expect(getPreviewSize()).toBe(270);
    registerPreviewSize('a', 400);
    expect(getPreviewSize()).toBe(400);
  });

  it('publishes the largest size of the live tiles and falls back when the largest leaves', () => {
    registerPreviewSize('small', 219);
    registerPreviewSize('large', 365);
    expect(getPreviewSize()).toBe(365);
    registerPreviewSize('small', 230);
    expect(getPreviewSize()).toBe(365);
    unregisterPreviewSize('large');
    expect(getPreviewSize()).toBe(230);
    unregisterPreviewSize('small');
    // With no tile alive the last size stands.
    expect(getPreviewSize()).toBe(230);
  });

  it('keeps the size when every tile has gone, which is when the Build page opens', () => {
    registerPreviewSize('a', 270);
    unregisterPreviewSize('a');
    expect(getPreviewSize()).toBe(270);
  });

  it('remembers the largest size in storage, and a fresh page starts from it', async () => {
    registerPreviewSize('a', 400);
    registerPreviewSize('a', 270);
    expect(localStorage.getItem('nexus.build.previewSize')).toBe('400');
    vi.resetModules();
    const fresh = await import('./previewSize');
    expect(fresh.getPreviewSize()).toBe(400);
  });

  it('ignores a stored size that is not usable', async () => {
    for (const bad of ['abc', '5', '99999', '270.5']) {
      localStorage.setItem('nexus.build.previewSize', bad);
      vi.resetModules();
      const fresh = await import('./previewSize');
      expect(fresh.getPreviewSize()).toBeNull();
    }
  });
});
