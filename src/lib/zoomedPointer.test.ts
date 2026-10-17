import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveZoom, pointerFraction, rectZoomShortfall } from './zoomedPointer';

// An element offset inside a zoomed ancestor, in layout px.
const ZOOM = 1.83;
const LAYOUT_W = 260;
const trueX = (fx: number) => (27 + fx * LAYOUT_W) * ZOOM;
const trueY = (fy: number) => (100 + fy * 150) * ZOOM;
const standardRect = { left: 27 * ZOOM, top: 100 * ZOOM, width: LAYOUT_W * ZOOM, height: 150 * ZOOM };
const legacyRect = { left: 27, top: 100, width: LAYOUT_W, height: 150 };

describe('rectZoomShortfall', () => {
  it('is 1 for a standard rect, which already shares the pointer space', () => {
    expect(rectZoomShortfall(standardRect.width, LAYOUT_W, ZOOM)).toBe(1);
  });

  it('is the zoom for a legacy rect reported in unzoomed px', () => {
    expect(rectZoomShortfall(legacyRect.width, LAYOUT_W, ZOOM)).toBe(ZOOM);
  });

  it('absorbs the integer rounding of offsetWidth on a standard rect', () => {
    expect(rectZoomShortfall(400.5 * ZOOM, 401, ZOOM)).toBe(1);
  });

  it('ignores a transform scale when no zoom is applied', () => {
    expect(rectZoomShortfall(LAYOUT_W * 1.83, LAYOUT_W, 1)).toBe(1);
    expect(rectZoomShortfall(LAYOUT_W * 0.5, LAYOUT_W, 1)).toBe(1);
  });

  it('is 1 without a usable measurement', () => {
    expect(rectZoomShortfall(0, 0, 2)).toBe(1);
    expect(rectZoomShortfall(100, 100, 0)).toBe(1);
  });
});

describe('pointerFraction', () => {
  it.each([0.1, 0.5, 0.9])('lands on %s in a standard engine', fx => {
    const k = rectZoomShortfall(standardRect.width, LAYOUT_W, ZOOM);
    const p = pointerFraction(trueX(fx), trueY(0.5), standardRect, k);
    expect(p.x).toBeCloseTo(fx, 6);
    expect(p.y).toBeCloseTo(0.5, 6);
  });

  it.each([0.1, 0.5, 0.9])('lands on %s in a legacy zoom engine', fx => {
    const k = rectZoomShortfall(legacyRect.width, LAYOUT_W, ZOOM);
    const p = pointerFraction(trueX(fx), trueY(0.5), legacyRect, k);
    expect(p.x).toBeCloseTo(fx, 6);
    expect(p.y).toBeCloseTo(0.5, 6);
  });

  it('shows the uncorrected math missing in a legacy engine (measured 0.269, 1.001, 1.733)', () => {
    const naive = (fx: number) => (trueX(fx) - legacyRect.left) / legacyRect.width;
    expect(naive(0.1)).toBeCloseTo(0.269, 2);
    expect(naive(0.5)).toBeCloseTo(1.001, 2);
    expect(naive(0.9)).toBeCloseTo(1.733, 2);
  });
});

describe('effectiveZoom', () => {
  afterEach(() => vi.restoreAllMocks());

  it('multiplies the computed zoom up the ancestor chain', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.appendChild(inner);
    document.body.appendChild(outer);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      el => ({ zoom: el === outer ? '2' : el === inner ? '1.5' : '1' }) as CSSStyleDeclaration,
    );
    expect(effectiveZoom(inner)).toBe(3);
    outer.remove();
  });
});
