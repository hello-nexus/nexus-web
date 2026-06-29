import { afterEach, describe, expect, it } from 'vitest';
import { inferSurfaceFromViewport } from './inferSurface';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

describe('inferSurfaceFromViewport', () => {
  afterEach(() => setViewport(1024, 768));

  it('classifies the Y70 2.5K (682x2560, the misread case) as y70', () => {
    setViewport(682, 2560);
    expect(inferSurfaceFromViewport(false)).toBe('y70');
  });

  it('classifies the Y70 4K (734x2560 CSS at 150% scaling) as y70', () => {
    setViewport(734, 2560);
    expect(inferSurfaceFromViewport(false)).toBe('y70');
  });

  it('classifies the Y70 by aspect regardless of orientation or scaling', () => {
    setViewport(2560, 682); // landscape framebuffer - aspect is the same
    expect(inferSurfaceFromViewport(false)).toBe('y70');
    setViewport(341, 1280); // 2.5K at 200% scaling (dpr 2) - still 3.75:1
    expect(inferSurfaceFromViewport(false)).toBe('y70');
  });

  it('classifies the Q-series (720x1280) as q60', () => {
    setViewport(720, 1280);
    expect(inferSurfaceFromViewport(false)).toBe('q60');
  });

  it('classifies phone-shaped viewports (well under 3:1) as phone', () => {
    setViewport(402, 874); // ~2.17:1 tall phone
    expect(inferSurfaceFromViewport(false)).toBe('phone');
    setViewport(874, 402); // landscape phone
    expect(inferSurfaceFromViewport(false)).toBe('phone');
    setViewport(800, 1280); // tablet portrait, 1.6:1
    expect(inferSurfaceFromViewport(false)).toBe('phone');
  });

  it('honours the phone hint regardless of viewport', () => {
    setViewport(682, 2560);
    expect(inferSurfaceFromViewport(true)).toBe('phone');
  });
});
