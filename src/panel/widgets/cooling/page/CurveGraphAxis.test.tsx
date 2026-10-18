import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    // Flat edges: the line is the points plus one flat extension each side,
    // entering at the first point's duty and leaving at the last's.
    expect(pathD(container).split(/[ML]/).filter(s => s.trim())).toHaveLength(4);
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
    // Wrapped: the line is the points plus one edge value each side, and
    // both edges sit on the same value (40%, midway 22h -> 2h).
    expect(pathD(container).split(/[ML]/).filter(s => s.trim())).toHaveLength(4);
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

  it('draws a labelled vertical line per marker and none without', () => {
    const base = { points: [{ temp: 2, speed: 20 }, { temp: 22, speed: 60 }], tempMin: 0, tempMax: 24 };
    const { container, rerender } = render(<CurveGraph {...base} />);
    const lines = () => container.querySelectorAll('svg line').length;
    const without = lines();
    rerender(<CurveGraph {...base} markers={[{ x: 6, label: '6:00 AM' }, { x: 18, label: '6:00 PM' }]} />);
    expect(lines()).toBe(without + 2);
    const labels = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(labels).toEqual(expect.arrayContaining(['6:00 AM', '6:00 PM']));
  });

  it('does not make points draggable unless editable', () => {
    const { container } = render(<CurveGraph points={[{ temp: 2, speed: 20 }, { temp: 22, speed: 60 }]} tempMin={0} tempMax={24} />);
    const circle = container.querySelector('circle[class*="curvePoint"]') as SVGCircleElement;
    expect(circle).not.toBeNull();
    expect(circle.style.cursor).toBe('');
  });

  it('draws read-only points as small inert dots, and keeps handles by default', () => {
    const base = { points: [{ temp: 2, speed: 20 }, { temp: 22, speed: 60 }], tempMin: 0, tempMax: 24 };
    const { container, rerender } = render(<CurveGraph {...base} editable />);
    const dot = () => container.querySelector('svg circle') as SVGCircleElement;
    expect(dot().getAttribute('r')).toBe('7');
    rerender(<CurveGraph {...base} readOnly />);
    expect(dot().getAttribute('r')).toBe('3');
    expect(dot().getAttribute('class')).toMatch(/curvePointStatic/);
  });

  it('hides the y label that the live readout would sit on', () => {
    const { container } = render(
      <CurveGraph points={[{ temp: 0, speed: 10 }, { temp: 24, speed: 10 }]} tempMin={0} tempMax={24} currentTemp={12} />,
    );
    const label = (text: string) => Array.from(container.querySelectorAll('span')).find(s => s.textContent === text)!;
    expect(label('0%').style.visibility).toBe('hidden');
    expect(label('50%').style.visibility).toBe('');
    expect(label('100%').style.visibility).toBe('');
  });

  it('hides the x label the live readout would sit on', () => {
    const { container } = render(
      <CurveGraph
        points={[{ temp: 0, speed: 10 }, { temp: 24, speed: 10 }]}
        tempMin={0}
        tempMax={24}
        currentTemp={12.2}
        axis={{ xStep: 6, formatX: h => `${h}h`, formatLiveX: () => 'now' }}
      />,
    );
    const label = (text: string) => Array.from(container.querySelectorAll('span')).find(s => s.textContent === text)!;
    expect(label('12h').style.visibility).toBe('hidden');
    expect(label('0h').style.visibility).toBe('');
    expect(label('24h').style.visibility).toBe('');
  });

  it('sizes the x clearance from the measured readout, so a narrow one hides less', () => {
    const widths = new Map<string, number>([['curveAxisLiveX', 20]]);
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      const cls = Array.from(this.classList).find(c => /curveAxisLiveX/.test(c));
      return cls ? widths.get('curveAxisLiveX')! : 0;
    });
    try {
      const { container } = render(
        <CurveGraph
          points={[{ temp: 0, speed: 10 }, { temp: 24, speed: 10 }]}
          tempMin={0}
          tempMax={24}
          currentTemp={7.5}
          axis={{ xStep: 6, formatX: h => `${h}h`, formatLiveX: () => 'now' }}
        />,
      );
      const label = (text: string) => Array.from(container.querySelectorAll('span')).find(s => s.textContent === text)!;
      // 6h sits 24 px from the dot: the 44 px fallback would hide it, a 20 px
      // readout clears at 22 px.
      expect(label('6h').style.visibility).toBe('');
      expect(label('12h').style.visibility).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  describe('verticalDrag', () => {
    const pts = [{ temp: 2, speed: 10 }, { temp: 6, speed: 50 }, { temp: 12, speed: 100 }];
    const drag = {
      isLocked: (p: { temp: number }) => p.temp === 6,
      apply: (all: { temp: number; speed: number }[], i: number, speed: number) =>
        all.map((p, k) => (k === i || (i === 0 && k === 2) ? { ...p, speed } : p)),
    };
    const setup = (onChange = vi.fn()) => {
      vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ left: 0, top: 0, width: 400, height: 140, right: 400, bottom: 140, x: 0, y: 0, toJSON: () => ({}) });
      Element.prototype.setPointerCapture = vi.fn();
      const view = render(<CurveGraph points={pts} tempMin={0} tempMax={24} editable verticalDrag={drag} onChange={onChange} />);
      const handles = Array.from(view.container.querySelectorAll('circle[class*="curvePoint"]')) as SVGCircleElement[];
      return { ...view, handles, onChange };
    };

    it('draws locked points as inert dots and the rest as vertical handles', () => {
      const { handles } = setup();
      expect(handles.map(h => h.getAttribute('r'))).toEqual(['7', '3', '7']);
      expect(handles.map(h => h.style.cursor)).toEqual(['ns-resize', '', 'ns-resize']);
    });

    it('commits the group a drag returns, with x unchanged and previews on the way', () => {
      const { handles, onChange } = setup();
      fireEvent.pointerDown(handles[0]);
      fireEvent.pointerMove(handles[0], { clientX: 300, clientY: 82.4 });
      fireEvent.pointerUp(handles[0]);
      expect(onChange).toHaveBeenCalledWith([{ temp: 2, speed: 40 }, { temp: 6, speed: 50 }, { temp: 12, speed: 40 }]);
    });

    it('ignores a drag on a locked point and never adds or removes points', () => {
      const { handles, onChange, container } = setup();
      fireEvent.pointerDown(handles[1]);
      fireEvent.pointerMove(handles[1], { clientX: 100, clientY: 20 });
      fireEvent.pointerUp(handles[1]);
      fireEvent.doubleClick(container.querySelector('svg[preserveAspectRatio]')!, { clientX: 200, clientY: 60 });
      fireEvent.contextMenu(handles[0]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
