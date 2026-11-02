import { afterEach, describe, expect, it } from 'vitest';
import { getPreviewSize, isStaleSize, previewSizeFor, resetPreviewSize, setPreviewSize } from './previewSize';

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
  it('keeps an image near the wanted size and replaces one far off either way', () => {
    expect(isStaleSize(270, 270)).toBe(false);
    expect(isStaleSize(250, 270)).toBe(false);
    expect(isStaleSize(300, 270)).toBe(false);
    expect(isStaleSize(1024, 270)).toBe(true);
    expect(isStaleSize(200, 270)).toBe(true);
  });
});

describe('the shared size', () => {
  it('starts unknown and takes the first measurement', () => {
    expect(getPreviewSize()).toBeNull();
    setPreviewSize(null);
    expect(getPreviewSize()).toBeNull();
    setPreviewSize(270);
    expect(getPreviewSize()).toBe(270);
  });

  it('ignores a change inside the settle band and takes a real one', () => {
    setPreviewSize(270);
    setPreviewSize(278);
    expect(getPreviewSize()).toBe(270);
    setPreviewSize(400);
    expect(getPreviewSize()).toBe(400);
  });
});
