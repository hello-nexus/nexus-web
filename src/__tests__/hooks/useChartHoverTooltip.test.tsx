import { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChartHoverTooltip, type ChartHoverTooltipOptions } from '../../hooks/useChartHoverTooltip';

// jsdom has no layout, so wrapper/tooltip sizes are stubbed via property
// overrides; the assertions target the placement math (left/top writes).

const WRAP = { clientWidth: 400, clientHeight: 200 };
const TIP = { offsetWidth: 100, offsetHeight: 50 };

function Harness({ opts, onReady }: {
  opts?: ChartHoverTooltipOptions;
  onReady: (api: { tip: () => HTMLDivElement; trackPoint: (x: number, y: number) => void }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { tooltipRef, trackPoint } = useChartHoverTooltip(wrapRef, true, opts);
  return (
    <div ref={(el) => {
      wrapRef.current = el;
      if (!el) return;
      Object.defineProperty(el, 'clientWidth', { value: WRAP.clientWidth, configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: WRAP.clientHeight, configurable: true });
    }}>
      <div ref={(el) => {
        tooltipRef.current = el;
        if (!el) return;
        Object.defineProperty(el, 'offsetWidth', { value: TIP.offsetWidth, configurable: true });
        Object.defineProperty(el, 'offsetHeight', { value: TIP.offsetHeight, configurable: true });
        onReady({ tip: () => el, trackPoint });
      }} />
    </div>
  );
}

function mount(opts?: ChartHoverTooltipOptions) {
  let api!: { tip: () => HTMLDivElement; trackPoint: (x: number, y: number) => void };
  render(<Harness opts={opts} onReady={(a) => { api = a; }} />);
  return api;
}

describe('useChartHoverTooltip placement', () => {
  it('top mode pins to the top inset and ignores the anchor y', () => {
    const api = mount();
    api.trackPoint(50, 150);
    expect(api.tip().style.left).toBe('72px');
    expect(api.tip().style.top).toBe('8px');
  });

  it('flips left of the anchor when the box would overflow the right edge', () => {
    const api = mount();
    api.trackPoint(350, 20);
    expect(api.tip().style.left).toBe(`${350 - 22 - TIP.offsetWidth}px`);
  });

  it('follow mode centers vertically on the anchor', () => {
    const api = mount({ anchor: 'follow' });
    api.trackPoint(50, 120);
    expect(api.tip().style.left).toBe('72px');
    expect(api.tip().style.top).toBe(`${120 - TIP.offsetHeight / 2}px`);
  });

  it('follow mode clamps inside the wrapper at both vertical extremes', () => {
    const api = mount({ anchor: 'follow' });
    api.trackPoint(50, 5);
    expect(api.tip().style.top).toBe('0px');
    api.trackPoint(50, 195);
    expect(api.tip().style.top).toBe(`${WRAP.clientHeight - TIP.offsetHeight}px`);
  });
});
