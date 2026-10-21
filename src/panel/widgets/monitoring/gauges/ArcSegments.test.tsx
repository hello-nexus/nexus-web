import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArcSegments, type ArcGeometry } from './ArcSegments';

const gradient = { id: 'arc', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
const ring: ArcGeometry = { cx: 50, cy: 50, radius: 43.5, startDeg: -90, sweepDeg: 360, strokeWidth: 9 };
const open: ArcGeometry = { ...ring, startDeg: 135, sweepDeg: 270 };

function parts(geometry: ArcGeometry) {
  const { container } = render(<svg><ArcSegments geometry={geometry} gradient={gradient} fillPercent={50} /></svg>);
  return {
    mask: container.querySelector('mask path')!,
    segments: Array.from(container.querySelectorAll('g[mask] path')),
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

  it('insets a closed ring mask by one cap radius and leaves an open arc flush', () => {
    const arcLength = 2 * Math.PI * ring.radius;
    const closed = parts(ring).mask;
    expect(Number(closed.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(arcLength / 2 - ring.strokeWidth, 2);
    const openArc = parts(open).mask;
    expect(Number(openArc.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo((open.sweepDeg / 360) * arcLength / 2, 2);
  });

  it('drops the inset and caps on a complete closed ring', () => {
    const { container } = render(<svg><ArcSegments geometry={ring} gradient={gradient} fillPercent={100} /></svg>);
    const mask = container.querySelector('mask path')!;
    expect(mask.getAttribute('stroke-linecap')).toBe('butt');
    expect(Number(mask.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(2 * Math.PI * ring.radius, 2);
  });

  it('patches the start seam of a closed ring only when complete', () => {
    const at = (fillPercent: number) => render(
      <svg><ArcSegments geometry={ring} gradient={gradient} fillPercent={fillPercent} /></svg>,
    ).container.querySelectorAll('path[data-seam]').length;
    expect(at(100)).toBe(2);
    expect(at(99)).toBe(0);
    const open = render(<svg><ArcSegments geometry={{ ...ring, sweepDeg: 270 }} gradient={gradient} fillPercent={100} /></svg>);
    expect(open.container.querySelectorAll('path[data-seam]')).toHaveLength(0);
  });
});
