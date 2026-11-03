import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreviewSize, isStaleSize, MAX_REDRAWS, mayRedraw, previewSizeFor, type RedrawRecord, REDRAW_INTERVAL_MS, registerPreviewSize, resetPreviewSize, unregisterPreviewSize } from './previewSize';

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
  it('keeps an image inside the window around the wanted size, bounds included', () => {
    expect(isStaleSize(270, 270)).toBe(false);
    expect(isStaleSize(0.75 * 400, 400)).toBe(false);
    expect(isStaleSize(1.5 * 400, 400)).toBe(false);
    expect(isStaleSize(540, 360)).toBe(false);
  });

  it('replaces an image below or above it', () => {
    expect(isStaleSize(299, 400)).toBe(true);
    expect(isStaleSize(601, 400)).toBe(true);
    expect(isStaleSize(1024, 270)).toBe(true);
    expect(isStaleSize(200, 270)).toBe(true);
  });

  it('treats the unsized default image as too large for any want under 683, and fine for a larger one', () => {
    expect(isStaleSize(1024, 683)).toBe(false);
    expect(isStaleSize(1024, 682)).toBe(true);
  });
});

describe('mayRedraw', () => {
  const at = (count: number, last: number): RedrawRecord => ({ count, last });

  it('allows a first attempt', () => {
    expect(mayRedraw(undefined, 5)).toBe(true);
  });

  it('spaces attempts by the interval', () => {
    expect(mayRedraw(at(1, 1000), 1000 + REDRAW_INTERVAL_MS - 1)).toBe(false);
    expect(mayRedraw(at(1, 1000), 1000 + REDRAW_INTERVAL_MS)).toBe(true);
  });

  it('stops after the budget, however long ago the last one was', () => {
    expect(mayRedraw(at(MAX_REDRAWS - 1, 0), REDRAW_INTERVAL_MS)).toBe(true);
    expect(mayRedraw(at(MAX_REDRAWS, 0), 100 * REDRAW_INTERVAL_MS)).toBe(false);
  });
});

describe('two contexts that want very different sizes', () => {
  // Each context redraws a stored image outside its window when its budget allows, saving at the size it wants.
  function simulate(minutes: number, foreignSaveEvery: number | null) {
    const contexts = [
      { wanted: 200, record: undefined as RedrawRecord | undefined },
      { wanted: 800, record: undefined as RedrawRecord | undefined },
    ];
    let stored = 1024;
    let saves = 0;
    for (let minute = 0; minute < minutes; minute++) {
      const now = minute * 60_000;
      if (foreignSaveEvery !== null && minute > 0 && minute % foreignSaveEvery === 0) stored = 200;
      for (const c of contexts) {
        if (isStaleSize(stored, c.wanted) && mayRedraw(c.record, now)) {
          c.record = { count: (c.record?.count ?? 0) + 1, last: now };
          stored = c.wanted;
          saves += 1;
        }
      }
    }
    return { saves, counts: contexts.map((c) => c.record?.count ?? 0), stored };
  }

  it('stops at the budget: each context draws at most MAX_REDRAWS times and the total is bounded', () => {
    const { saves, counts } = simulate(24 * 60, null);
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_REDRAWS);
    expect(saves).toBeLessThanOrEqual(2 * MAX_REDRAWS);
  });

  it('is bounded with a smaller save from elsewhere every few minutes too', () => {
    const { counts } = simulate(24 * 60, 7);
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_REDRAWS);
  });

  it('with sizes inside one window of each other it draws once and settles', () => {
    const contexts = [270, 330];
    let stored = 1024;
    let saves = 0;
    const records: (RedrawRecord | undefined)[] = [undefined, undefined];
    for (let minute = 0; minute < 120; minute++) {
      contexts.forEach((wanted, i) => {
        if (isStaleSize(stored, wanted) && mayRedraw(records[i], minute * 60_000)) {
          records[i] = { count: (records[i]?.count ?? 0) + 1, last: minute * 60_000 };
          stored = wanted;
          saves += 1;
        }
      });
    }
    expect(saves).toBe(1);
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

  it('remembers the last published size in storage, shrinking too, and a fresh page starts from it', async () => {
    registerPreviewSize('a', 400);
    expect(localStorage.getItem('nexus.build.previewSize')).toBe('400');
    registerPreviewSize('a', 270);
    expect(localStorage.getItem('nexus.build.previewSize')).toBe('270');
    vi.resetModules();
    const fresh = await import('./previewSize');
    expect(fresh.getPreviewSize()).toBe(270);
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
