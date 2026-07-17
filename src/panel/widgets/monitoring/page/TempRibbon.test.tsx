import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TempRibbon } from './TempRibbon';
import { CHART_PAD } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';

function stubWidth(width: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: 12, width, height: 12, toJSON: () => ({}),
  } as DOMRect);
}

// Segment rects carry the band fill; the clipPath's own rect (the label
// reserve) does not, so this scopes assertions to the drawn temperature
// segments only.
function segmentRects(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('rect[fill="var(--bad)"]')];
}

describe('TempRibbon', () => {
  it('renders no segments and no label when there are no points', () => {
    stubWidth(400);
    const { container, queryByText } = render(
      <TempRibbon points={[]} domain={[0, 1000]} />,
    );
    expect(segmentRects(container).length).toBe(0);
    expect(queryByText(/./)).toBeNull();
  });

  it('renders one segment per point and the current label', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }, { t: 1000, avg: 60, max: 62 }];
    const { container, getByText } = render(
      <TempRibbon points={points} domain={[0, 1000]} currentLabel="60C" />,
    );
    expect(segmentRects(container).length).toBe(3);
    expect(getByText('60C')).toBeInTheDocument();
  });

  it('renders a thicker band for a hotter point (waveform, not opacity)', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    const rects = segmentRects(container);
    expect(rects[0]).not.toHaveAttribute('fill-opacity');
    const coolHeight = Number(rects[0].getAttribute('height'));
    const hotHeight = Number(rects[1].getAttribute('height'));
    expect(hotHeight).toBeGreaterThan(coolHeight);
  });

  it('normalizes thickness against the observed window range, not a fixed absolute scale - a narrow real swing still reads clearly', () => {
    stubWidth(400);
    // A 4-degree idle-range swing, nowhere near any plausible fixed
    // threshold-relative scale (e.g. 55-85C) - the whole point of the
    // window-relative normalization is that this still shows a visible
    // thickness difference.
    const points = [{ t: 0, avg: 61, max: 61 }, { t: 500, avg: 65, max: 65 }, { t: 1000, avg: 62, max: 62 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    const heights = segmentRects(container).map(r => Number(r.getAttribute('height')));
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
  });

  it('renders a uniform thickness for a perfectly flat window', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 50, max: 50 }, { t: 500, avg: 50, max: 50 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    const heights = segmentRects(container).map(r => Number(r.getAttribute('height')));
    expect(heights[0]).toBe(heights[1]);
  });

  it('centers each band vertically as its thickness changes', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} height={12} />,
    );
    for (const rect of segmentRects(container)) {
      const y = Number(rect.getAttribute('y'));
      const h = Number(rect.getAttribute('height'));
      expect(y + h / 2).toBeCloseTo(6, 5);
    }
  });

  it('insets segments by CHART_PAD so they line up under the chart plot rect above (no label reserved)', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    const rects = segmentRects(container);
    // The first segment starts exactly at the chart's left inset, and the
    // last segment ends exactly at the chart's right inset - not the raw
    // container edges - matching where TimeSeriesChart draws its plot rect
    // for the same container width.
    expect(Number(rects[0].getAttribute('x'))).toBe(CHART_PAD.left);
    const last = rects[rects.length - 1];
    const lastRight = Number(last.getAttribute('x')) + Number(last.getAttribute('width'));
    expect(lastRight).toBe(400 - CHART_PAD.right);
  });

  it('clips the drawn segments to a reserved right-side lane when a label is shown, without rescaling their x position', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
    const withLabel = render(
      <TempRibbon points={points} domain={[0, 1000]} currentLabel="60C" />,
    );
    const withoutLabel = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    // Every point's x is identical whether or not the label reserve is
    // active - only visibility (the clip) differs, never the x-domain
    // mapping, so segments stay pixel-aligned with the chart above.
    const xsWithLabel = segmentRects(withLabel.container).map(r => r.getAttribute('x'));
    const xsWithoutLabel = segmentRects(withoutLabel.container).map(r => r.getAttribute('x'));
    expect(xsWithLabel).toEqual(xsWithoutLabel);

    const clipRect = withLabel.container.querySelector('clipPath rect')!;
    expect(Number(clipRect.getAttribute('width'))).toBeLessThan(400 - CHART_PAD.left - CHART_PAD.right);
  });

  it('does not reserve any width (full-width clip) when there is no current label', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 60, max: 62 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} />,
    );
    const clipRect = container.querySelector('clipPath rect')!;
    expect(Number(clipRect.getAttribute('width'))).toBe(400 - CHART_PAD.left - CHART_PAD.right);
  });

  it('renders the current label as a sibling of the ribbon track, not on a separate line underneath', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }];
    const { container, getByText } = render(
      <TempRibbon points={points} domain={[0, 1000]} currentLabel="40C" />,
    );
    const label = getByText('40C').closest('span');
    const svg = container.querySelector('svg');
    // Same parent element as the svg's own wrapper - one row, not a column
    // of two stacked blocks.
    expect(label?.parentElement).toBe(svg?.parentElement?.parentElement);
  });
});
