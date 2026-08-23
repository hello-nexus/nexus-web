import { describe, expect, it } from 'vitest';
import {
  applyPinch,
  canvasToScreen,
  clampScale,
  fitView,
  screenToCanvas,
  strokeBounds,
  zoomAbout,
} from './whiteboardGeometry';
import { MAX_SCALE, MIN_SCALE, type Stroke, type ViewTransform } from './whiteboardTypes';

const view: ViewTransform = { scale: 2, panX: 30, panY: -10 };

function stroke(points: Array<[number, number]>, width = 4): Stroke {
  return { tool: 'pen', color: '#fff', width, points: points.map(([x, y]) => ({ x, y })) };
}

describe('clampScale', () => {
  it('holds the zoom inside the supported range', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('falls back to 1 for any non-finite scale', () => {
    // A degenerate pinch (both pointers on one pixel) can produce NaN or
    // Infinity; either one silently blanks the canvas, so neither may reach
    // the transform. 1 is the safe recovery, not the clamp endpoint.
    expect(clampScale(NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(1);
    expect(clampScale(-Infinity)).toBe(1);
  });
});

describe('screenToCanvas / canvasToScreen', () => {
  it('round-trips a point through the view transform', () => {
    const point = { x: 123.5, y: -44.25 };
    const back = screenToCanvas(canvasToScreen(point, view), view);
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });
});

describe('applyPinch', () => {
  it('keeps the grabbed canvas point under the gesture centre', () => {
    const start: ViewTransform = { scale: 1, panX: 0, panY: 0 };
    const anchor = { x: 100, y: 200 };
    const held = screenToCanvas(anchor, start);

    // Spread doubles and the fingers move: the held point must still land
    // under the new centre, which is what makes a pinch feel anchored.
    const next = applyPinch(start, anchor, 50, { x: 260, y: 40 }, 100);
    expect(next.scale).toBeCloseTo(2, 6);
    const rendered = canvasToScreen(held, next);
    expect(rendered.x).toBeCloseTo(260, 6);
    expect(rendered.y).toBeCloseTo(40, 6);
  });

  it('treats a zero starting spread as pure pan', () => {
    const start: ViewTransform = { scale: 3, panX: 5, panY: 5 };
    const next = applyPinch(start, { x: 10, y: 10 }, 0, { x: 40, y: 10 }, 80);
    expect(next.scale).toBe(3);
  });

  it('clamps rather than running past the zoom limits', () => {
    const start: ViewTransform = { scale: MAX_SCALE, panX: 0, panY: 0 };
    const next = applyPinch(start, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 400);
    expect(next.scale).toBe(MAX_SCALE);
  });
});

describe('zoomAbout', () => {
  it('holds the anchor pixel fixed', () => {
    const anchor = { x: 400, y: 90 };
    const held = screenToCanvas(anchor, view);
    const next = zoomAbout(view, anchor, 1.5);
    const rendered = canvasToScreen(held, next);
    expect(rendered.x).toBeCloseTo(anchor.x, 6);
    expect(rendered.y).toBeCloseTo(anchor.y, 6);
  });
});

describe('strokeBounds', () => {
  it('is null with no ink', () => {
    expect(strokeBounds([])).toBeNull();
  });

  it('widens the box by each stroke half-width so thick lines are not clipped', () => {
    const bounds = strokeBounds([stroke([[0, 0], [10, 10]], 4)]);
    expect(bounds).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
  });
});

describe('fitView', () => {
  it('centres the viewport on the origin when there is no ink', () => {
    expect(fitView([], 200, 100)).toEqual({ scale: 1, panX: 100, panY: 50 });
  });

  it('centres the ink in the box', () => {
    const strokes = [stroke([[0, 0], [100, 50]], 0)];
    const fitted = fitView(strokes, 400, 400);
    const topLeft = canvasToScreen({ x: 0, y: 0 }, fitted);
    const bottomRight = canvasToScreen({ x: 100, y: 50 }, fitted);
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(200, 6);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(200, 6);
  });

  it('never magnifies past 1:1', () => {
    // A three-pixel doodle blown up to fill a 4x4 tile reads as a rendering
    // fault, so a fit only ever shrinks.
    const fitted = fitView([stroke([[0, 0], [2, 2]], 0)], 400, 400);
    expect(fitted.scale).toBe(1);
  });

  it('shrinks oversized ink to fit inside the padding', () => {
    const strokes = [stroke([[0, 0], [1000, 500]], 0)];
    const fitted = fitView(strokes, 200, 200, 10);
    const topLeft = canvasToScreen({ x: 0, y: 0 }, fitted);
    const bottomRight = canvasToScreen({ x: 1000, y: 500 }, fitted);
    expect(topLeft.x).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(bottomRight.x).toBeLessThanOrEqual(190 + 1e-6);
    expect(topLeft.y).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(bottomRight.y).toBeLessThanOrEqual(190 + 1e-6);
  });

  it('returns a usable view for a degenerate box', () => {
    expect(fitView([stroke([[0, 0]])], 0, 0)).toEqual({ scale: 1, panX: 0, panY: 0 });
  });
});
