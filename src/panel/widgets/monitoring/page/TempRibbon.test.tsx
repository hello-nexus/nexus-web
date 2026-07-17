import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TempRibbon } from './TempRibbon';
import { CHART_CARD_INSET_PX, CHART_PAD, TimeSeriesChart } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';

function stubWidth(width: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: 12, width, height: 12, toJSON: () => ({}),
  } as DOMRect);
}

// Segment rects carry the band fill - scopes assertions to the drawn
// temperature segments only (the icon and track are separate elements).
function segmentRects(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('rect[fill="var(--bad)"]')];
}

const CPU_SCALE = { floorC: 30, capC: 100 };
const GPU_SCALE = { floorC: 30, capC: 95 };

describe('TempRibbon', () => {
  it('renders no segments when there are no points', () => {
    stubWidth(400);
    const { container } = render(
      <TempRibbon points={[]} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    expect(segmentRects(container).length).toBe(0);
  });

  it('renders one segment per point', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }, { t: 1000, avg: 60, max: 62 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    expect(segmentRects(container).length).toBe(3);
  });

  it('renders no numeric value anywhere - the icon carries no readout (item 41: value lives only in the hover tooltip)', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 60, max: 62 }];
    const { queryByText } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    expect(queryByText(/./)).toBeNull();
  });

  it('renders a thicker band for a hotter point (waveform, not opacity)', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    const rects = segmentRects(container);
    expect(rects[0]).not.toHaveAttribute('fill-opacity');
    const coolHeight = Number(rects[0].getAttribute('height'));
    const hotHeight = Number(rects[1].getAttribute('height'));
    expect(hotHeight).toBeGreaterThan(coolHeight);
  });

  it('normalizes thickness against a fixed absolute scale, not the observed window range - a narrow real swing near the scale floor barely shows', () => {
    stubWidth(400);
    // A 4-degree idle-range swing sitting near the absolute floor (30C) -
    // under the old window-relative normalization this would have stretched
    // to fill the full thickness range; on the absolute scale it stays
    // close to the minimum.
    const points = [{ t: 0, avg: 31, max: 31 }, { t: 500, avg: 35, max: 35 }, { t: 1000, avg: 32, max: 32 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    const heights = segmentRects(container).map(r => Number(r.getAttribute('height')));
    expect(Math.max(...heights)).toBeLessThan(3);
  });

  it('the same absolute value produces the same thickness across different windows (a predictable gauge, not window-relative)', () => {
    stubWidth(400);
    const idleWindow = [{ t: 0, avg: 60, max: 60 }, { t: 500, avg: 60, max: 60 }];
    const loadedWindow = [{ t: 0, avg: 40, max: 40 }, { t: 500, avg: 60, max: 60 }, { t: 1000, avg: 95, max: 95 }];
    const a = render(<TempRibbon points={idleWindow} domain={[0, 1000]} {...CPU_SCALE} />);
    const b = render(<TempRibbon points={loadedWindow} domain={[0, 1000]} {...CPU_SCALE} />);
    const heightAt60InA = Number(segmentRects(a.container)[0].getAttribute('height'));
    const heightAt60InB = Number(segmentRects(b.container)[1].getAttribute('height'));
    expect(heightAt60InA).toBeCloseTo(heightAt60InB, 5);
  });

  it('a value at/above the per-kind cap renders at the ribbon\'s full height', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 95, max: 95 }, { t: 500, avg: 120, max: 120 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} height={12} {...GPU_SCALE} />,
    );
    const heights = segmentRects(container).map(r => Number(r.getAttribute('height')));
    // Both clamp to the same full-height thickness once at/over the cap.
    expect(heights[0]).toBeCloseTo(heights[1], 5);
    expect(heights[0]).toBeCloseTo(12, 5);
  });

  it('renders a uniform thickness for a perfectly flat window', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 50, max: 50 }, { t: 500, avg: 50, max: 50 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    const heights = segmentRects(container).map(r => Number(r.getAttribute('height')));
    expect(heights[0]).toBe(heights[1]);
  });

  it('centers each band vertically as its thickness changes', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} height={12} {...CPU_SCALE} />,
    );
    for (const rect of segmentRects(container)) {
      const y = Number(rect.getAttribute('y'));
      const h = Number(rect.getAttribute('height'));
      expect(y + h / 2).toBeCloseTo(6, 5);
    }
  });

  describe('pixel alignment with the chart plot rect (item 41, corrected in item 55 for the chart card\'s own CSS inset)', () => {
    it('insets segments by CHART_PAD plus the chart card\'s own CSS inset (CHART_CARD_INSET_PX) so they line up under the chart plot rect above', () => {
      stubWidth(400);
      const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
      const { container } = render(
        <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
      );
      const rects = segmentRects(container);
      // TimeSeriesChart's plot rect sits inside TWO stacked insets for the
      // SAME measured container width: CHART_PAD (the axis-label lane,
      // inside its own SVG) and its .chartWrap's own CSS padding+border
      // (CHART_CARD_INSET_PX, between the page edge and that SVG) - this
      // component's wrapper carries no padding of its own, so it must add
      // both to land at the same page position as the plot rect. A test
      // pinned only to CHART_PAD (as a prior round shipped) passes while
      // the two are visibly misaligned by CHART_CARD_INSET_PX in a real
      // browser, since jsdom applies no real CSS layout to catch it - see
      // TempRibbon.tsx's own doc comment.
      expect(Number(rects[0].getAttribute('x'))).toBe(CHART_PAD.left + CHART_CARD_INSET_PX);
      const last = rects[rects.length - 1];
      const lastRight = Number(last.getAttribute('x')) + Number(last.getAttribute('width'));
      expect(lastRight).toBe(400 - CHART_PAD.right - CHART_CARD_INSET_PX);
    });

    it('the band\'s x-offset never changes regardless of the icon - there is no reserved lane to desync it', () => {
      stubWidth(400);
      const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
      const a = render(<TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />);
      const b = render(<TempRibbon points={points} domain={[0, 1000]} height={20} {...CPU_SCALE} />);
      const xsA = segmentRects(a.container).map(r => r.getAttribute('x'));
      const xsB = segmentRects(b.container).map(r => r.getAttribute('x'));
      expect(xsA).toEqual(xsB);
      expect(Number(xsA[0])).toBe(CHART_PAD.left + CHART_CARD_INSET_PX);
    });

    it('renders no clipPath at all - the full band is always visible, nothing hidden behind a label', () => {
      stubWidth(400);
      const points = [{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 60, max: 62 }];
      const { container } = render(
        <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
      );
      expect(container.querySelector('clipPath')).toBeNull();
    });
  });

  describe('cross-component alignment against a real TimeSeriesChart (item 55)', () => {
    // jsdom applies no real CSS layout - TimeSeriesChart.tsx and TempRibbon.tsx
    // each measure their own wrapper's getBoundingClientRect() independently,
    // and this suite's global ResizeObserver stub (src/__tests__/setup.ts)
    // never fires a corrective callback, so BOTH land on the same raw
    // border-box number from stubWidth() below - reproducing the actual
    // pre-fix bug's condition (both components agreeing on the SAME
    // measured container width, per TimeSeriesChart.module.scss's
    // .chartWrap padding+border pushing its plot inward with no counterpart
    // on TempRibbon's own padding-less wrapper). A real browser was used to
    // confirm the fix closes an ACTUAL page-pixel gap (see the task notes);
    // this test pins the invariant that produces that result: TempRibbon's
    // drawn band starts CHART_CARD_INSET_PX further in than TimeSeriesChart's
    // own plot rect, for the same measured width - equal only once
    // TempRibbon adds that inset on top of the shared CHART_PAD.
    it('TempRibbon\'s drawn band starts CHART_CARD_INSET_PX past TimeSeriesChart\'s own plot rect, for the same measured container width', () => {
      stubWidth(400);
      const { container: chartContainer } = render(
        <TimeSeriesChart
          series={[{ id: 'cpu', name: 'CPU', color: '#8b5cf6', points: [{ t: 0, avg: 50, max: 55 }, { t: 1000, avg: 60, max: 65 }] }]}
          valueFormat={v => `${v}`}
          xTickFormat={() => ''}
          avgLabel="Avg"
          maxLabel="Max"
          domain={[0, 1000]}
        />,
      );
      const clipRect = chartContainer.querySelector('clipPath rect')!;
      const chartPlotX = Number(clipRect.getAttribute('x'));

      const { container: ribbonContainer } = render(
        <TempRibbon points={[{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 60, max: 62 }]} domain={[0, 1000]} {...CPU_SCALE} />,
      );
      const ribbonX = Number(segmentRects(ribbonContainer)[0].getAttribute('x'));

      expect(chartPlotX).toBe(CHART_PAD.left);
      expect(ribbonX).toBe(chartPlotX + CHART_CARD_INSET_PX);
    });
  });

  it('renders the thermometer icon inside the chart\'s left pad lane, positioned so it never consumes track width', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
    );
    const icon = container.querySelector('[class*="icon"]');
    expect(icon).toBeInTheDocument();
    expect(icon?.querySelector('svg')).toBeInTheDocument();
    // No numeric text anywhere near the icon.
    expect(icon?.textContent).toBe('');
  });
});
