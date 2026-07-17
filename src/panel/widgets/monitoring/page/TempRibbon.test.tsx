import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TempRibbon } from './TempRibbon';
import { CHART_PAD } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';

function stubWidth(width: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: 12, width, height: 12, toJSON: () => ({}),
  } as DOMRect);
}

describe('TempRibbon', () => {
  it('renders no segments and no label when there are no points', () => {
    stubWidth(400);
    const { container, queryByText } = render(
      <TempRibbon points={[]} domain={[0, 1000]} minC={40} maxC={90} />,
    );
    expect(container.querySelectorAll('rect').length).toBe(0);
    expect(queryByText(/./)).toBeNull();
  });

  it('renders one segment per point and the current label', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }, { t: 1000, avg: 60, max: 62 }];
    const { container, getByText } = render(
      <TempRibbon points={points} domain={[0, 1000]} minC={40} maxC={90} currentLabel="60C" />,
    );
    expect(container.querySelectorAll('rect').length).toBe(3);
    expect(getByText('60C')).toBeInTheDocument();
  });

  it('renders a thicker band for a hotter point (waveform, not opacity)', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} minC={40} maxC={90} />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects[0]).not.toHaveAttribute('fill-opacity');
    const coolHeight = Number(rects[0].getAttribute('height'));
    const hotHeight = Number(rects[1].getAttribute('height'));
    expect(hotHeight).toBeGreaterThan(coolHeight);
  });

  it('centers each band vertically as its thickness changes', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} minC={40} maxC={90} height={12} />,
    );
    const rects = container.querySelectorAll('rect');
    for (const rect of rects) {
      const y = Number(rect.getAttribute('y'));
      const h = Number(rect.getAttribute('height'));
      expect(y + h / 2).toBeCloseTo(6, 5);
    }
  });

  it('insets segments by CHART_PAD so they line up under the chart plot rect above', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 50, max: 52 }, { t: 1000, avg: 60, max: 62 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} minC={40} maxC={90} />,
    );
    const rects = container.querySelectorAll('rect');
    // The first segment starts exactly at the chart's left inset, and the
    // last segment ends exactly at the chart's right inset - not the raw
    // container edges - matching where TimeSeriesChart draws its plot rect
    // for the same container width.
    expect(Number(rects[0].getAttribute('x'))).toBe(CHART_PAD.left);
    const last = rects[rects.length - 1];
    const lastRight = Number(last.getAttribute('x')) + Number(last.getAttribute('width'));
    expect(lastRight).toBe(400 - CHART_PAD.right);
  });
});
