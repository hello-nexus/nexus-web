import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TempRibbon } from './TempRibbon';

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

  it('renders a higher opacity for a hotter point', () => {
    stubWidth(400);
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 500, avg: 90, max: 92 }];
    const { container } = render(
      <TempRibbon points={points} domain={[0, 1000]} minC={40} maxC={90} />,
    );
    const rects = container.querySelectorAll('rect');
    const coolOpacity = Number(rects[0].getAttribute('fill-opacity'));
    const hotOpacity = Number(rects[1].getAttribute('fill-opacity'));
    expect(hotOpacity).toBeGreaterThan(coolOpacity);
  });
});
