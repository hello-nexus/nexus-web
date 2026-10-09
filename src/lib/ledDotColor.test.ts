import { describe, expect, it } from 'vitest';
import { framePointToCanvas, ledDotColor } from './ledDotColor';

const frame = { canvasX: 0, canvasY: 0, canvasW: 500, canvasH: 300 };
// 2x2 output: red, green / blue, white.
const px = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);

describe('framePointToCanvas', () => {
  it('maps an unturned frame point to canvas fractions', () => {
    expect(framePointToCanvas(frame, 1, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('turns about the frame centre', () => {
    const p = framePointToCanvas({ ...frame, canvasRotation: 180 }, 0, 0);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });
});

describe('ledDotColor', () => {
  it('reads the pixel under the point', () => {
    expect(ledDotColor(px, 2, 2, { ...frame, canvasW: 1000, canvasH: 600 }, 0.1, 0.1)).toBe('rgb(255, 20, 20)');
    expect(ledDotColor(px, 2, 2, { ...frame, canvasW: 1000, canvasH: 600 }, 0.9, 0.1)).toBe('rgb(20, 255, 20)');
    expect(ledDotColor(px, 2, 2, { ...frame, canvasW: 1000, canvasH: 600 }, 0.9, 0.9)).toBe('rgb(255, 255, 255)');
  });

  it('follows the frame turn', () => {
    const full = { canvasX: 0, canvasY: 0, canvasW: 1000, canvasH: 600, canvasRotation: 180 };
    expect(ledDotColor(px, 2, 2, full, 0.1, 0.1)).toBe('rgb(255, 255, 255)');
  });

  it('floors dark pixels so the dot still shows', () => {
    expect(ledDotColor(new Uint8Array(3), 1, 1, frame, 0.5, 0.5)).toBe('rgb(20, 20, 20)');
  });

  it('returns null without a frame', () => {
    expect(ledDotColor(null, 0, 0, frame, 0.5, 0.5)).toBeNull();
  });

  it('clamps a point outside the canvas to the edge pixel', () => {
    expect(ledDotColor(px, 2, 2, { ...frame, canvasX: 900, canvasW: 500 }, 1, 0)).toBe('rgb(20, 255, 20)');
  });
});
