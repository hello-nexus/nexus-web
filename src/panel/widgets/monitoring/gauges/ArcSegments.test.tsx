import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArcSegments, type ArcGeometry } from './ArcSegments';

const gradient = { id: 'arc', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
const ring: ArcGeometry = { cx: 50, cy: 50, radius: 43.5, startDeg: -90, sweepDeg: 360, strokeWidth: 9 };
const open: ArcGeometry = { ...ring, startDeg: 135, sweepDeg: 270 };
const circumference = 2 * Math.PI * ring.radius;

function parts(geometry: ArcGeometry, fillPercent = 50) {
  const { container } = render(<svg><ArcSegments geometry={geometry} gradient={gradient} fillPercent={fillPercent} /></svg>);
  return {
    mask: container.querySelector('mask path')!,
    segments: Array.from(container.querySelectorAll('g[mask] path:not([data-seam]):not([data-start-cap])')),
    seam: container.querySelector('path[data-seam]'),
    startCap: container.querySelector('path[data-start-cap]'),
  };
}

describe('ArcSegments', () => {
  it.each([['closed ring', ring], ['open arc', open]])('shapes the %s ends with a stroke-wide round mask', (_, geometry) => {
    const { mask, segments } = parts(geometry);
    expect(mask.getAttribute('stroke-width')).toBe(String(geometry.strokeWidth));
    expect(mask.getAttribute('stroke-linecap')).toBe('round');
    for (const seg of segments) {
      expect(Number(seg.getAttribute('stroke-width'))).toBeGreaterThan(geometry.strokeWidth);
    }
  });

  it.each([10, 50, 97, 99])('draws the closed ring mask as the ungraded dash at %i%%', (percent) => {
    const { mask } = parts(ring, percent);
    const [dash, gap] = mask.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(dash).toBeCloseTo((percent / 100) * circumference, 2);
    expect(gap).toBeCloseTo(circumference, 2);
    expect(mask.getAttribute('stroke-linecap')).toBe('round');
    expect(mask.getAttribute('d')!.startsWith('M 50.000 6.500')).toBe(true);
  });

  it('draws a complete closed ring as the whole closed path', () => {
    const { mask } = parts(ring, 100);
    expect(mask.getAttribute('stroke-dasharray')).toBeNull();
    expect(mask.getAttribute('stroke-linecap')).toBe('butt');
    expect(mask.getAttribute('d')!.endsWith('Z')).toBe(true);
  });

  it('leaves an open arc mask flush with its start', () => {
    const { mask } = parts(open, 50);
    const arcLength = (open.sweepDeg / 360) * circumference;
    expect(Number(mask.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(arcLength / 2, 2);
  });

  it('colors the start cap with the first color until the caps meet', () => {
    for (const percent of [10, 50, 90]) {
      const { startCap, seam, segments } = parts(ring, percent);
      expect(seam).toBeNull();
      expect(startCap!.getAttribute('stroke')).toBe(segments[0].getAttribute('stroke'));
    }
  });

  it('spans the start with one seam patch of the end color once the caps meet', () => {
    for (const percent of [97, 99, 100]) {
      const { seam, startCap, segments } = parts(ring, percent);
      expect(startCap).toBeNull();
      expect(seam!.getAttribute('stroke')).toBe(segments[segments.length - 1].getAttribute('stroke'));
      // One arc from before the start (top center, x just left of 50) to after it.
      const d = seam!.getAttribute('d')!;
      expect(d.match(/M/g)).toHaveLength(1);
      expect(Number(d.split(' ')[1])).toBeLessThan(50);
      expect(Number(d.split(' ').slice(-2)[0])).toBeGreaterThan(50);
    }
  });

  it('adds no start patch to an open arc', () => {
    const { seam, startCap } = parts(open, 50);
    expect(seam).toBeNull();
    expect(startCap).toBeNull();
  });
});
