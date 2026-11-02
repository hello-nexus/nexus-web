import { afterEach, describe, expect, it } from 'vitest';
import { getPreviewSize, isStaleSize, previewSizeFor, registerPreviewSize, resetPreviewSize, unregisterPreviewSize } from './previewSize';

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
  it('keeps an image near the wanted size or somewhat larger, and replaces one too small or far too large', () => {
    expect(isStaleSize(270, 270)).toBe(false);
    expect(isStaleSize(250, 270)).toBe(false);
    expect(isStaleSize(540, 270)).toBe(false);
    expect(isStaleSize(1024, 270)).toBe(true);
    expect(isStaleSize(200, 270)).toBe(true);
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
    expect(getPreviewSize()).toBeNull();
  });
});
