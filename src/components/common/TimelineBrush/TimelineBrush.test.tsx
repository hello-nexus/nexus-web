import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TimelineBrush } from './TimelineBrush';

// jsdom has no layout/pointer-capture engine. Fixed 1000px box over a
// [0, 100_000]ms domain gives a clean 100ms/px scale for deterministic drag
// math, matching the cooling CurveEditor's stubSvgGeometry approach.
function stubGeometry() {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 40, width: 1000, height: 40,
    toJSON: () => ({}),
  } as DOMRect);
}

const DOMAIN_START = 0;
const DOMAIN_END = 100_000;
const ariaValueText = (from: number, to: number) => `${from}-${to}`;

function renderBrush(onChange: (from: number, to: number, phase: 'drag' | 'end') => void, over: Partial<{ from: number; to: number; minWindowMs: number }> = {}) {
  return render(
    <TimelineBrush
      domainStart={DOMAIN_START}
      domainEnd={DOMAIN_END}
      from={over.from ?? 20_000}
      to={over.to ?? 40_000}
      onChange={onChange}
      minWindowMs={over.minWindowMs ?? 1_000}
      ariaLabel="Time range"
      ariaValueText={ariaValueText}
    />,
  );
}

describe('TimelineBrush', () => {
  beforeEach(() => {
    stubGeometry();
  });

  it('exposes a slider role with aria-valuemin/max/now/text', () => {
    const { getByRole } = renderBrush(() => {});
    const el = getByRole('slider');
    expect(el).toHaveAttribute('aria-valuemin', String(DOMAIN_START));
    expect(el).toHaveAttribute('aria-valuemax', String(DOMAIN_END));
    expect(el).toHaveAttribute('aria-valuenow', '40000');
    expect(el).toHaveAttribute('aria-valuetext', '20000-40000');
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('dragging the box (window interior) pans, reporting drag then end', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    // window spans [20_000, 40_000]ms -> [200, 400]px at 100ms/px.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 350 });
    expect(onChange).toHaveBeenLastCalledWith(25_000, 45_000, 'drag');

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 350 });
    expect(onChange).toHaveBeenLastCalledWith(25_000, 45_000, 'end');
  });

  it('dragging the left edge resizes from, clamped to the domain start', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 150 });
    expect(onChange).toHaveBeenLastCalledWith(15_000, 40_000, 'drag');

    fireEvent.pointerMove(el, { pointerId: 1, clientX: -500 });
    expect(onChange).toHaveBeenLastCalledWith(0, 40_000, 'drag');
  });

  it('dragging the right edge within snap tolerance of the domain end snaps to it exactly', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    // toPx=400; domainEndPx=1000; moving to 995px is within the 6px snap zone.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 995 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, DOMAIN_END, 'drag');
  });

  it('dragging the right edge short of the snap zone does not snap', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 900 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, 90_000, 'drag');
  });

  it('resize clamps to the minimum window width', () => {
    const onChange = vi.fn();
    // Narrow starting window so a left-edge drag past `to` hits the floor.
    const { getByRole } = renderBrush(onChange, { from: 20_000, to: 21_000, minWindowMs: 1_000 });
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 205 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, 21_000, 'drag');
  });

  it('clicking the track outside the window recenters on the clicked point immediately', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    // window width 20_000ms; clicking at 700px (70_000ms) recenters to [60_000, 80_000].
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 700 });
    expect(onChange).toHaveBeenLastCalledWith(60_000, 80_000, 'drag');

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 700 });
    expect(onChange).toHaveBeenLastCalledWith(60_000, 80_000, 'end');
  });

  describe('edge labels', () => {
    it('renders no labels when formatEdgeLabel is omitted (backwards compatible)', () => {
      const { container } = renderBrush(() => {});
      expect(container.querySelector('[class*="edgeLabel"]')).toBeNull();
    });

    it('renders the formatted from/to labels outside the window', () => {
      const { container, getByText } = render(
        <TimelineBrush
          domainStart={DOMAIN_START}
          domainEnd={DOMAIN_END}
          from={20_000}
          to={40_000}
          onChange={() => {}}
          minWindowMs={1_000}
          ariaLabel="Time range"
          ariaValueText={ariaValueText}
          formatEdgeLabel={t => `t${t}`}
        />,
      );
      expect(getByText('t20000')).toBeInTheDocument();
      expect(getByText('t40000')).toBeInTheDocument();
      expect(container.querySelectorAll('[class*="edgeLabel"]').length).toBe(2);
    });
  });

  describe('keyboard', () => {
    it('ArrowRight pans forward by 10% of the window', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith(22_000, 42_000, 'end');
    });

    it('ArrowLeft pans backward by 10% of the window', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenCalledWith(18_000, 38_000, 'end');
    });

    it('Shift+ArrowRight widens the window, keeping the right edge anchored', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'ArrowRight', shiftKey: true });
      expect(onChange).toHaveBeenCalledWith(18_000, 40_000, 'end');
    });

    it('Shift+ArrowLeft narrows the window, keeping the right edge anchored', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'ArrowLeft', shiftKey: true });
      expect(onChange).toHaveBeenCalledWith(22_000, 40_000, 'end');
    });

    it('Home jumps the window to the oldest part of the domain', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'Home' });
      expect(onChange).toHaveBeenCalledWith(0, 20_000, 'end');
    });

    it('End jumps the window to touch the live domain edge (re-follows)', () => {
      const onChange = vi.fn();
      const { getByRole } = renderBrush(onChange);
      fireEvent.keyDown(getByRole('slider'), { key: 'End' });
      expect(onChange).toHaveBeenCalledWith(80_000, DOMAIN_END, 'end');
    });
  });
});
