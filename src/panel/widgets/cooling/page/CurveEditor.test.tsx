import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurveCard } from './CurveEditor';
import { newCurve } from '../../../../types/cooling';
import type { CurveDef } from '../../../../types/cooling';

// Regression guard for the cooling-page fan-curve graph. Commit 534af55 made
// the graph display-only; the call sites stopped passing `editable`/`onChange`,
// so multipoint points could no longer be dragged, added, or removed. These
// tests render the real CurveCard and assert each gesture reaches onChange, so
// dropping `editable` at a call site fails here rather than shipping silently.

// jsdom has no layout/pointer-capture engine. Give the SVG a fixed box so the
// drag math is deterministic, and no-op setPointerCapture so onPointerDown runs.
function stubSvgGeometry() {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 140, width: 400, height: 140,
    toJSON: () => ({}),
  } as DOMRect);
}

function renderMultipointCard(onChange: (c: CurveDef) => void) {
  const curve = newCurve('curve-test');
  return render(
    <CurveCard
      curve={curve}
      allCurves={[curve]}
      sources={[]}
      inUse={false}
      expanded
      onChange={onChange}
      onDelete={() => {}}
    />,
  );
}

describe('cooling fan-curve graph interactivity', () => {
  beforeEach(() => {
    stubSvgGeometry();
  });

  it('renders draggable point markers for a multipoint curve', () => {
    const { container } = renderMultipointCard(() => {});
    const points = container.querySelectorAll('svg circle');
    // newCurve seeds 5 multipoint points; markers must render to be grabbable.
    expect(points.length).toBeGreaterThanOrEqual(5);
  });

  it('dragging a point commits the moved point set via onChange', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    const circle = container.querySelector('svg circle')!;
    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 0, clientY: 120 });
    fireEvent.pointerMove(circle, { pointerId: 1, clientX: 0, clientY: 20 });
    fireEvent.pointerUp(circle, { pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(5);
    // Moving the handle up the chart raises the duty of the lowest-temp point.
    const moved = [...next.multipoint.points].sort((a, b) => a.temp - b.temp)[0];
    expect(moved.speed).toBeGreaterThan(25);
  });

  it('double-clicking the chart adds a point', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    // The chart svg is the one holding the point markers (the others are chip icons).
    const svg = container.querySelector('circle')!.closest('svg')!;
    fireEvent.doubleClick(svg, { clientX: 200, clientY: 70 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(6);
  });

  it('right-clicking a point removes it', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    const circle = container.querySelector('svg circle')!;
    fireEvent.contextMenu(circle);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(4);
  });
});
