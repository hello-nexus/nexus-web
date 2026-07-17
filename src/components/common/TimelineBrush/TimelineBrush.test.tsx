import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TimelineBrush } from './TimelineBrush';

// jsdom has no layout/pointer-capture engine. A 1200px box with the
// component's own 100px label lane on each side gives an exactly 1000px
// track over a [0, 100_000]ms domain - a clean 100ms/px scale for
// deterministic drag math (every clientX below is the pre-shift 0-1000
// track position plus the 100px left lane), matching the cooling
// CurveEditor's stubSvgGeometry approach.
const LANE = 100;

function stubGeometry() {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 40, width: 1200, height: 40,
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

    // window spans [20_000, 40_000]ms -> [200, 400]px at 100ms/px, offset by the LANE.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 300 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 350 });
    expect(onChange).toHaveBeenLastCalledWith(25_000, 45_000, 'drag');

    fireEvent.pointerUp(el, { pointerId: 1, clientX: LANE + 350 });
    expect(onChange).toHaveBeenLastCalledWith(25_000, 45_000, 'end');
  });

  it('dragging the left edge resizes from, clamped to the domain start', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 200 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 150 });
    expect(onChange).toHaveBeenLastCalledWith(15_000, 40_000, 'drag');

    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE - 500 });
    expect(onChange).toHaveBeenLastCalledWith(0, 40_000, 'drag');
  });

  it('dragging the right edge within snap tolerance of the domain end snaps to it exactly', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    // toPx=400 (track-local); domainEndPx=1000; moving to 995px is within the 6px snap zone.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 995 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, DOMAIN_END, 'drag');
  });

  it('dragging the right edge short of the snap zone does not snap', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 900 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, 90_000, 'drag');
  });

  it('resize clamps to the minimum window width', () => {
    const onChange = vi.fn();
    // Narrow starting window so a left-edge drag past `to` hits the floor.
    const { getByRole } = renderBrush(onChange, { from: 20_000, to: 21_000, minWindowMs: 1_000 });
    const el = getByRole('slider');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 200 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 205 });
    expect(onChange).toHaveBeenLastCalledWith(20_000, 21_000, 'drag');
  });

  it('clicking the track outside the window recenters on the clicked point immediately', () => {
    const onChange = vi.fn();
    const { getByRole } = renderBrush(onChange);
    const el = getByRole('slider');

    // window width 20_000ms; clicking at track-local 700px (70_000ms) recenters to [60_000, 80_000].
    fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 700 });
    expect(onChange).toHaveBeenLastCalledWith(60_000, 80_000, 'drag');

    fireEvent.pointerUp(el, { pointerId: 1, clientX: LANE + 700 });
    expect(onChange).toHaveBeenLastCalledWith(60_000, 80_000, 'end');
  });

  describe('edge labels', () => {
    it('renders no labels when formatEdgeLabels is omitted (backwards compatible)', () => {
      const { container } = renderBrush(() => {});
      expect(container.querySelector('[class*="edgeLabel"]')).toBeNull();
    });

    it('renders the block\'s own domainStart/domainEnd, not the selected window', () => {
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
          formatEdgeLabels={(start, end) => [`s${start}`, `e${end}`]}
        />,
      );
      expect(getByText(`s${DOMAIN_START}`)).toBeInTheDocument();
      expect(getByText(`e${DOMAIN_END}`)).toBeInTheDocument();
      expect(container.querySelectorAll('[class*="edgeLabel"]').length).toBe(2);
    });
  });

  describe('silhouette gap rendering', () => {
    it('splits the silhouette fill into independent subpaths across a data gap instead of lerping across it', () => {
      const { container } = render(
        <TimelineBrush
          domainStart={DOMAIN_START}
          domainEnd={DOMAIN_END}
          from={20_000}
          to={40_000}
          onChange={() => {}}
          minWindowMs={1_000}
          ariaLabel="Time range"
          ariaValueText={ariaValueText}
          silhouette={[
            { t: 0, v: 10 }, { t: 1_000, v: 20 }, { t: 2_000, v: 15 },
            { t: 90_000, v: 80 }, { t: 91_000, v: 70 },
          ]}
        />,
      );
      const path = container.querySelector('[class*="silhouette"]')!;
      const d = path.getAttribute('d')!;
      expect(d.match(/M/g)?.length).toBe(2);
    });
  });

  describe('resize cursor affordance', () => {
    it('shows ew-resize on the root when the pointer hovers an edge, before any click', () => {
      const { getByRole } = renderBrush(() => {});
      const el = getByRole('slider');

      // window [20_000, 40_000]ms -> [200, 400]px at 100ms/px, offset by the LANE.
      fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 200 });
      expect(el).toHaveStyle({ cursor: 'ew-resize' });
    });

    it('does not show ew-resize when hovering the box interior or the track', () => {
      const { getByRole } = renderBrush(() => {});
      const el = getByRole('slider');

      fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 300 });
      expect(el.style.cursor).not.toBe('ew-resize');

      fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 700 });
      expect(el.style.cursor).not.toBe('ew-resize');
    });

    it('clears the hover cursor on pointer leave', () => {
      const { getByRole } = renderBrush(() => {});
      const el = getByRole('slider');

      fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 200 });
      expect(el).toHaveStyle({ cursor: 'ew-resize' });
      fireEvent.pointerLeave(el);
      expect(el.style.cursor).not.toBe('ew-resize');
    });

    it('keeps ew-resize for the whole gesture while actively resizing an edge, even once the pointer drifts off the exact edge pixel', () => {
      const { getByRole } = renderBrush(() => {});
      const el = getByRole('slider');

      fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 200 });
      expect(el).toHaveStyle({ cursor: 'ew-resize' });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: LANE + 260 });
      expect(el).toHaveStyle({ cursor: 'ew-resize' });
    });

    it('does not show ew-resize while panning (dragging the box interior)', () => {
      const { getByRole } = renderBrush(() => {});
      const el = getByRole('slider');

      fireEvent.pointerDown(el, { pointerId: 1, clientX: LANE + 300 });
      expect(el.style.cursor).not.toBe('ew-resize');
    });
  });

  describe('rounding', () => {
    it('rounds the draggable window box corners', () => {
      const { container } = renderBrush(() => {});
      const windowRect = container.querySelector('[class*="window"]')!;
      expect(Number(windowRect.getAttribute('rx'))).toBeGreaterThan(0);
      expect(Number(windowRect.getAttribute('ry'))).toBeGreaterThan(0);
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
