import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TempRibbon } from './TempRibbon';
import { CHART_PAD } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';

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

  describe('pixel alignment with the chart plot rect (item 41)', () => {
    it('insets segments by CHART_PAD so they line up under the chart plot rect above', () => {
      stubWidth(400);
      const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
      const { container } = render(
        <TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />,
      );
      const rects = segmentRects(container);
      // The first segment starts exactly at the chart's left inset, and the
      // last segment ends exactly at the chart's right inset - not the raw
      // container edges - matching where TimeSeriesChart draws its plot rect
      // for the same container width. Pinned directly to CHART_PAD (the
      // same constant TimeSeriesChart itself uses), not a locally
      // duplicated value.
      expect(Number(rects[0].getAttribute('x'))).toBe(CHART_PAD.left);
      const last = rects[rects.length - 1];
      const lastRight = Number(last.getAttribute('x')) + Number(last.getAttribute('width'));
      expect(lastRight).toBe(400 - CHART_PAD.right);
    });

    it('the band\'s x-offset never changes regardless of the icon - there is no reserved lane to desync it', () => {
      stubWidth(400);
      const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
      const a = render(<TempRibbon points={points} domain={[0, 1000]} {...CPU_SCALE} />);
      const b = render(<TempRibbon points={points} domain={[0, 1000]} height={20} {...CPU_SCALE} />);
      const xsA = segmentRects(a.container).map(r => r.getAttribute('x'));
      const xsB = segmentRects(b.container).map(r => r.getAttribute('x'));
      expect(xsA).toEqual(xsB);
      expect(Number(xsA[0])).toBe(CHART_PAD.left);
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
