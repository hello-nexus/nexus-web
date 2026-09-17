import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurveGraph } from './CurveEditor';

// The brightness schedule reuses the cooling curve graph on a 0..24 hour axis.
// `axis` swaps the labels and closes the line across midnight; the cooling
// call sites pass nothing and must keep their °C ticks and flat edges.

const pathD = (container: HTMLElement) => {
  // The line is the stroked path (the area fill comes first).
  const paths = Array.from(container.querySelectorAll('svg path'));
  return paths.find(p => p.getAttribute('fill') === 'none')!.getAttribute('d')!;
};
const endpointsY = (d: string) => {
  const nums = d.match(/[-\d.]+/g)!.map(Number);
  return { first: nums[1], last: nums[nums.length - 1] };
};

describe('CurveGraph axis', () => {
  it('keeps the cooling defaults without an axis prop', () => {
    const { container } = render(
      <CurveGraph points={[{ temp: 30, speed: 20 }, { temp: 90, speed: 80 }]} />,
    );
    const labels = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(labels).toContain('20°');
    expect(labels).toContain('100°');
    // Flat edges: the line enters at the first point's duty and leaves at the last's.
    const { first, last } = endpointsY(pathD(container));
    expect(first).not.toBeCloseTo(last, 0);
  });

  it('labels a wrapping hour axis at the given step and joins the ends across midnight', () => {
    const { container } = render(
      <CurveGraph
        points={[{ temp: 2, speed: 20 }, { temp: 22, speed: 60 }]}
        tempMin={0}
        tempMax={24}
        axis={{ xStep: 6, formatX: h => `${h % 24}h`, wrap: true }}
      />,
    );
    const labels = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(labels).toEqual(expect.arrayContaining(['0h', '6h', '12h', '18h', '0h']));
    expect(labels).not.toContain('4h');
    expect(labels).not.toContain('20°');
    // Wrapped: both chart edges sit on the same value (40%, midway 22h -> 2h).
    const { first, last } = endpointsY(pathD(container));
    expect(first).toBeCloseTo(last, 5);
  });

  it('draws a sampled curve for smooth easing and keeps the markers on the points', () => {
    const points = [{ temp: 20, speed: 20 }, { temp: 60, speed: 80 }, { temp: 100, speed: 40 }];
    const { container } = render(<CurveGraph points={points} easing="smooth" />);
    const vertices = pathD(container).split(/[ML]/).filter(s => s.trim()).length;
    expect(vertices).toBeGreaterThan(100);
    expect(container.querySelectorAll('svg circle')).toHaveLength(3);
    // The line still passes through the middle point: its y equals the marker's.
    const mid = container.querySelectorAll('svg circle')[1];
    const nums = pathD(container).match(/[-\d.]+/g)!.map(Number);
    const midX = Number(mid.getAttribute('cx'));
    let best = Infinity, bestY = NaN;
    for (let i = 0; i < nums.length; i += 2) { if (Math.abs(nums[i] - midX) < best) { best = Math.abs(nums[i] - midX); bestY = nums[i + 1]; } }
    expect(bestY).toBeCloseTo(Number(mid.getAttribute('cy')), 0);
  });
});
