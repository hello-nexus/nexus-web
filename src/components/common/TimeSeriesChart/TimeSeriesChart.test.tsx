import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeSeriesChart } from './TimeSeriesChart';
import type { TimeSeriesSeries } from './timeSeriesChartUtils';

const HOUR = 3_600_000;

function makeSeries(): TimeSeriesSeries[] {
  return [
    {
      id: 'cpu', name: 'CPU', color: '#8b5cf6',
      points: [
        { t: 0, avg: 40, max: 45 },
        { t: HOUR, avg: 50, max: 55 },
        { t: 2 * HOUR, avg: 60, max: 65 },
      ],
    },
    {
      id: 'gpu', name: 'GPU', color: '#22d3ee',
      points: [
        { t: 0, avg: 35, max: 38 },
        { t: HOUR, avg: 45, max: 48 },
        { t: 2 * HOUR, avg: 55, max: 58 },
      ],
    },
  ];
}

const baseProps = {
  valueFormat: (v: number) => `${Math.round(v)}C`,
  xTickFormat: (t: number) => `T${t}`,
  avgLabel: 'Avg',
  maxLabel: 'Max',
};

describe('TimeSeriesChart', () => {
  it('renders one line path per series', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(1);
    expect(container.querySelectorAll('path[stroke="#22d3ee"]').length).toBe(1);
  });

  it('breaks a series into multiple path segments across a gap', () => {
    const series: TimeSeriesSeries[] = [
      {
        id: 'cpu', name: 'CPU', color: '#8b5cf6',
        points: [
          { t: 0, avg: 40, max: 45 },
          { t: HOUR, avg: 50, max: 55 },
          { t: 10 * HOUR, avg: 60, max: 65 },
          { t: 11 * HOUR, avg: 62, max: 66 },
        ],
      },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(2);
  });

  it('renders one connected line across widely (decimated) spaced points, not a break per point', () => {
    // Regression: the gap threshold used to derive from a caller-supplied
    // nominal bucket size, so decimated data (spaced far wider than the
    // source bucket) rendered every point as an isolated, invisible segment.
    const WIDE = 20 * 60_000;
    const series: TimeSeriesSeries[] = [
      {
        id: 'cpu', name: 'CPU', color: '#8b5cf6',
        points: Array.from({ length: 20 }, (_, i) => ({ t: i * WIDE, avg: 40 + i, max: 45 + i })),
      },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(1);
    expect(container.querySelectorAll('circle[fill="#8b5cf6"]').length).toBe(0);
  });

  it('still breaks on a genuine gap once spacing is derived from decimated data', () => {
    const WIDE = 20 * 60_000;
    const series: TimeSeriesSeries[] = [
      {
        id: 'cpu', name: 'CPU', color: '#8b5cf6',
        points: [
          ...Array.from({ length: 5 }, (_, i) => ({ t: i * WIDE, avg: 40 + i, max: 45 })),
          ...Array.from({ length: 5 }, (_, i) => ({ t: 10 * WIDE + i * WIDE, avg: 50 + i, max: 55 })),
        ],
      },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(2);
  });

  it('renders an isolated single-point segment as a dot instead of an invisible path', () => {
    const HOUR2 = HOUR;
    const series: TimeSeriesSeries[] = [
      {
        id: 'cpu', name: 'CPU', color: '#8b5cf6',
        points: [
          { t: 0, avg: 40, max: 45 },
          { t: HOUR2, avg: 42, max: 46 },
          { t: 20 * HOUR2, avg: 90, max: 95 },
          { t: 40 * HOUR2, avg: 41, max: 44 },
          { t: 41 * HOUR2, avg: 43, max: 47 },
        ],
      },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelector('circle[fill="#8b5cf6"]')).toBeInTheDocument();
  });

  it('renders a legend entry per series', () => {
    render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('GPU')).toBeInTheDocument();
  });

  it('shows the waiting state when there is no data', () => {
    render(<TimeSeriesChart series={[]} {...baseProps} />);
    expect(screen.getByText('chart.waiting')).toBeInTheDocument();
  });

  it('spans an explicit domain wider than the data instead of stretching the data to fill it', () => {
    // Data covers 0..2h; the domain forces 0..10h, so the axis ends at 10h and
    // the data occupies only the left fifth (blank on the right).
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} domain={[0, 10 * HOUR]} />);
    const tickLabels = Array.from(container.querySelectorAll('text')).map(t => t.textContent);
    expect(tickLabels).toContain(`T${10 * HOUR}`);   // domain end
    expect(tickLabels).not.toContain(`T${2 * HOUR}`); // data extent, would show if squished
  });

  it('shows a per-series avg/max tooltip on hover', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    // The tooltip header renders its own precise timestamp (not the caller's
    // xTickFormat, which is "T0" here), so scope the check to the tooltip
    // itself instead of screen.getByText.
    const tooltipHeader = container.querySelector('[class*="tooltipHeader"]');
    expect(tooltipHeader?.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
    expect(screen.getByText('Max 45C')).toBeInTheDocument();
    expect(screen.getByText('Avg 35C')).toBeInTheDocument();
  });

  it('shows minute precision in the tooltip header even when xTickFormat is date-only (30d axis range)', () => {
    // Regression: the tooltip header used to reuse xTickFormat directly, so
    // at wide ranges (30d) where the axis formatter drops the time
    // component entirely, the exact bucket time was hidden.
    const dateOnlyXTickFormat = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const { container } = render(
      <TimeSeriesChart series={makeSeries()} {...baseProps} xTickFormat={dateOnlyXTickFormat} />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    const tooltipHeader = container.querySelector('[class*="tooltipHeader"]');
    expect(tooltipHeader?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('clears the tooltip on mouse leave', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });
    expect(screen.getByText('Avg 40C')).toBeInTheDocument();

    fireEvent.mouseLeave(svg);
    expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
  });

  it('renders a translucent band for a supplied episode span', () => {
    const { container } = render(
      <TimeSeriesChart series={makeSeries()} {...baseProps} bands={[{ startT: 0, endT: HOUR, color: 'var(--warn)' }]} />,
    );
    expect(container.querySelector('rect[fill="var(--warn)"]')).toBeInTheDocument();
  });

  it('appends tooltipExtra content after the series rows, called with the hovered timestamp', () => {
    const tooltipExtra = vi.fn((t: number) => <div>extra for {t}</div>);
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} tooltipExtra={tooltipExtra} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(tooltipExtra).toHaveBeenCalledWith(0);
    expect(screen.getByText('extra for 0')).toBeInTheDocument();
  });

  it('renders nothing extra when tooltipExtra returns null', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} tooltipExtra={() => null} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
  });

  it('renders tooltipHeaderExtra on the same row as the timestamp, called with the hovered timestamp', () => {
    const tooltipHeaderExtra = vi.fn((t: number) => <span>temp-{t}</span>);
    const { container } = render(
      <TimeSeriesChart series={makeSeries()} {...baseProps} tooltipHeaderExtra={tooltipHeaderExtra} />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(tooltipHeaderExtra).toHaveBeenCalledWith(0);
    const header = container.querySelector('[class*="tooltipHeader"]')!;
    expect(header.textContent).toContain('temp-0');
    // Same element as the timestamp - one row, not a separate line.
    const spans = header.querySelectorAll('span');
    expect(spans[spans.length - 1].textContent).toBe('temp-0');
  });

  it('omitting tooltipHeaderExtra does not break the tooltip (backwards compatible)', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
  });

  it('omitting tooltipExtra does not break the tooltip (backwards compatible)', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
  });

  it('hides the series avg/max rows when hideSeriesRows is set, keeping the header and tooltipExtra', () => {
    const { container } = render(
      <TimeSeriesChart series={makeSeries()} {...baseProps} hideSeriesRows tooltipExtra={() => <div>custom body</div>} />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
    expect(screen.getByText('custom body')).toBeInTheDocument();
  });

  it('renders a filled gradient area per series when fillGradient is set', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} fillGradient />);
    expect(container.querySelectorAll('linearGradient').length).toBe(2);
    expect(container.querySelectorAll('path[fill^="url(#"]').length).toBe(2);
  });

  it('does not render gradients or fills when fillGradient is omitted (backwards compatible)', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    expect(container.querySelectorAll('linearGradient').length).toBe(0);
  });

  it('sanitizes a colon-bearing series id (e.g. a GPU adapter series) in the gradient url reference', () => {
    const series: TimeSeriesSeries[] = [
      { id: 'gpu:0', name: 'GPU', color: '#22d3ee', points: [{ t: 0, avg: 10, max: 12 }, { t: HOUR, avg: 20, max: 22 }] },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} fillGradient />);
    const gradient = container.querySelector('linearGradient')!;
    const gradientId = gradient.getAttribute('id')!;
    expect(gradientId).not.toContain(':');
    const fillPath = container.querySelector(`path[fill="url(#${gradientId})"]`);
    expect(fillPath).toBeInTheDocument();
  });

  describe('drag-select (onRangeSelect)', () => {
    function stubGeometry(svg: SVGSVGElement) {
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      Element.prototype.hasPointerCapture = vi.fn(() => true);
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });
    }

    it('reports an ascending [from, to] range on release after a real drag', () => {
      const onRangeSelect = vi.fn();
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onRangeSelect={onRangeSelect} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 300, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 100, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 100, pointerId: 1 });

      expect(onRangeSelect).toHaveBeenCalledTimes(1);
      const [from, to] = onRangeSelect.mock.calls[0];
      expect(from).toBeLessThan(to);
    });

    it('renders a rubber-band overlay while dragging', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onRangeSelect={vi.fn()} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 300, pointerId: 1 });

      expect(container.querySelector('[class*="dragSelection"]')).toBeInTheDocument();
    });

    it('does not report a range for a stray click under the drag threshold', () => {
      const onRangeSelect = vi.fn();
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onRangeSelect={onRangeSelect} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 201, pointerId: 1 });

      expect(onRangeSelect).not.toHaveBeenCalled();
    });

    it('Escape cancels an in-progress drag without reporting a range', () => {
      const onRangeSelect = vi.fn();
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onRangeSelect={onRangeSelect} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 300, pointerId: 1 });
      expect(container.querySelector('[class*="dragSelection"]')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(container.querySelector('[class*="dragSelection"]')).not.toBeInTheDocument();

      fireEvent.pointerUp(svg, { clientX: 300, pointerId: 1 });
      expect(onRangeSelect).not.toHaveBeenCalled();
    });

    it('does not enable drag-select when onRangeSelect is omitted (backwards compatible)', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 300, pointerId: 1 });

      expect(container.querySelector('[class*="dragSelection"]')).not.toBeInTheDocument();
    });
  });

  describe('onPointClick (point-in-time snapshot)', () => {
    function stubGeometry(svg: SVGSVGElement) {
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      Element.prototype.hasPointerCapture = vi.fn(() => true);
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });
    }

    it('fires onPointClick with the clicked timestamp for a stray click (no drag)', () => {
      const onPointClick = vi.fn();
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onPointClick={onPointClick} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 201, pointerId: 1 });

      expect(onPointClick).toHaveBeenCalledTimes(1);
      expect(typeof onPointClick.mock.calls[0][0]).toBe('number');
    });

    it('does not fire onPointClick for a real drag - only onRangeSelect does', () => {
      const onPointClick = vi.fn();
      const onRangeSelect = vi.fn();
      const { container } = render(
        <TimeSeriesChart series={makeSeries()} {...baseProps} onPointClick={onPointClick} onRangeSelect={onRangeSelect} />,
      );
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 300, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 300, pointerId: 1 });

      expect(onPointClick).not.toHaveBeenCalled();
      expect(onRangeSelect).toHaveBeenCalledTimes(1);
    });

    it('works without onRangeSelect - a click-only chart still reports the clicked frame', () => {
      const onPointClick = vi.fn();
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} onPointClick={onPointClick} />);
      const svg = container.querySelector('svg')!;
      stubGeometry(svg);

      fireEvent.pointerDown(svg, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 200, pointerId: 1 });

      expect(onPointClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('selectedT', () => {
    it('renders no persistent selection line when omitted (backwards compatible)', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      expect(container.querySelector('line[stroke="var(--accent)"]')).toBeNull();
    });

    it('renders a persistent solid line at the given timestamp, distinct from the dashed hover cursor', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} selectedT={HOUR} />);
      const line = container.querySelector('line[stroke="var(--accent)"]');
      expect(line).toBeInTheDocument();
      expect(line).not.toHaveAttribute('stroke-dasharray');
      // At t=HOUR (the midpoint of the 0..2*HOUR domain), the line sits at
      // the plot's horizontal midpoint.
      const x = Number(line!.getAttribute('x1'));
      expect(x).toBeGreaterThan(200);
      expect(x).toBeLessThanOrEqual(240);
    });

    it('renders no line when selectedT is null', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} selectedT={null} />);
      expect(container.querySelector('line[stroke="var(--accent)"]')).toBeNull();
    });
  });

  describe('currentValue', () => {
    it('renders no readout when omitted (backwards compatible)', () => {
      render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      expect(screen.queryByText('99C')).toBeNull();
    });

    it('renders the readout at the axis label position, at the value\'s own y', () => {
      render(<TimeSeriesChart series={makeSeries()} {...baseProps} yAxisSide="right" currentValue={{ value: 53, label: '53C' }} />);
      const label = screen.getByText('53C');
      expect(label).toHaveAttribute('text-anchor', 'start');
    });
  });

  describe('yAxisSide', () => {
    it('renders y-tick labels on the left by default', () => {
      render(<TimeSeriesChart series={makeSeries()} {...baseProps} yDomain={[0, 100]} />);
      const label = screen.getByText('100C');
      expect(label).toHaveAttribute('text-anchor', 'end');
      expect(Number(label.getAttribute('x'))).toBeLessThan(220);
    });

    it('moves y-tick labels to the right edge when yAxisSide is right', () => {
      render(<TimeSeriesChart series={makeSeries()} {...baseProps} yDomain={[0, 100]} yAxisSide="right" />);
      const label = screen.getByText('100C');
      expect(label).toHaveAttribute('text-anchor', 'start');
      expect(Number(label.getAttribute('x'))).toBeGreaterThan(220);
    });
  });

  describe('ribbons', () => {
    const ribbonSeries = makeSeries();

    function ribbonRects(container: HTMLElement, fill = 'var(--bad)') {
      return [...container.querySelectorAll(`rect[fill="${fill}"]`)];
    }

    it('renders no ribbon rects when ribbons is omitted (backwards compatible)', () => {
      const { container } = render(<TimeSeriesChart series={ribbonSeries} {...baseProps} />);
      expect(ribbonRects(container).length).toBe(0);
    });

    it('renders one rect per ribbon point', () => {
      const points = [{ t: 0, avg: 40, max: 41 }, { t: HOUR, avg: 90, max: 92 }, { t: 2 * HOUR, avg: 60, max: 62 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, floor: 30, cap: 100, fill: 'var(--bad)' }]} />,
      );
      expect(ribbonRects(container).length).toBe(3);
    });

    it('renders a thicker band for a value nearer the cap (waveform, not opacity)', () => {
      const points = [{ t: 0, avg: 40, max: 41 }, { t: HOUR, avg: 90, max: 92 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, floor: 30, cap: 100, fill: 'var(--bad)' }]} />,
      );
      const rects = ribbonRects(container);
      expect(rects[0]).not.toHaveAttribute('fill-opacity');
      expect(Number(rects[1].getAttribute('height'))).toBeGreaterThan(Number(rects[0].getAttribute('height')));
    });

    it('clamps thickness to the band height once at/over the cap', () => {
      const points = [{ t: 0, avg: 100, max: 100 }, { t: HOUR, avg: 150, max: 150 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, floor: 30, cap: 100, fill: 'var(--bad)', height: 12 }]} />,
      );
      const heights = ribbonRects(container).map(r => Number(r.getAttribute('height')));
      expect(heights[0]).toBeCloseTo(heights[1], 5);
      expect(heights[0]).toBeCloseTo(12, 5);
    });

    it('shares the exact x pixel mapping with the line above it - no separate alignment computation', () => {
      const points = [{ t: 0, avg: 40, max: 41 }, { t: HOUR, avg: 50, max: 52 }, { t: 2 * HOUR, avg: 60, max: 62 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 2 * HOUR]}
          ribbons={[{ points, floor: 30, cap: 100, fill: 'var(--bad)' }]}
        />,
      );
      const clipRect = container.querySelector('clipPath rect')!;
      const plotX = Number(clipRect.getAttribute('x'));
      const plotW = Number(clipRect.getAttribute('width'));
      const rects = ribbonRects(container);
      expect(Number(rects[0].getAttribute('x'))).toBe(plotX);
      const last = rects[rects.length - 1];
      expect(Number(last.getAttribute('x')) + Number(last.getAttribute('width'))).toBe(plotX + plotW);
    });

    it('reserves its own height from the line/area\'s own plot range, stacking multiple ribbons in order', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps}
          ribbons={[
            { points, floor: 0, cap: 100, fill: 'var(--bad)', height: 12 },
            { points, floor: 0, cap: 100, fill: 'var(--accent)', height: 12 },
          ]}
        />,
      );
      const first = ribbonRects(container, 'var(--bad)')[0];
      const second = ribbonRects(container, 'var(--accent)')[0];
      const firstMidY = Number(first.getAttribute('y')) + Number(first.getAttribute('height')) / 2;
      const secondMidY = Number(second.getAttribute('y')) + Number(second.getAttribute('height')) / 2;
      expect(secondMidY).toBeGreaterThan(firstMidY);
    });

    it('renders a valueLabel at the axis label position, on the yAxisSide edge', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} yAxisSide="right"
          ribbons={[{ points, floor: 0, cap: 100, fill: 'var(--bad)', valueLabel: '61C' }]}
        />,
      );
      // A value distinct from any y-axis tick, so this can only be the
      // ribbon's own valueLabel.
      const label = screen.getByText('61C');
      expect(label).toHaveAttribute('text-anchor', 'start');
    });

    it('renders no valueLabel text when omitted', () => {
      const points = [{ t: 0, avg: 77, max: 77 }];
      render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, floor: 0, cap: 100, fill: 'var(--bad)' }]} />,
      );
      expect(screen.queryByText('77C')).toBeNull();
    });

    it('renders the icon in the pad lane opposite the axis labels', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps}
          ribbons={[{ points, floor: 0, cap: 100, fill: 'var(--bad)', icon: <circle data-testid="ribbon-icon" r={6} /> }]}
        />,
      );
      const icon = container.querySelector('[data-testid="ribbon-icon"]')!;
      expect(icon).toBeInTheDocument();
      const g = icon.closest('g[transform]')!;
      // Default yAxisSide is 'left', so the icon lane sits on the right
      // (opposite the axis) - a translate x past the plot's midpoint.
      const translateX = Number(g.getAttribute('transform')!.match(/translate\(([-\d.]+),/)![1]);
      expect(translateX).toBeGreaterThan(220);
    });

    it('moves the icon lane to the left when yAxisSide is right (opposite the axis)', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} yAxisSide="right"
          ribbons={[{ points, floor: 0, cap: 100, fill: 'var(--bad)', icon: <circle data-testid="ribbon-icon" r={6} /> }]}
        />,
      );
      const icon = container.querySelector('[data-testid="ribbon-icon"]')!;
      const g = icon.closest('g[transform]')!;
      const translateX = Number(g.getAttribute('transform')!.match(/translate\(([-\d.]+),/)![1]);
      expect(translateX).toBeLessThan(220);
    });

    it('renders no icon group when omitted', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, floor: 0, cap: 100, fill: 'var(--bad)' }]} />,
      );
      expect(container.querySelector('[data-testid="ribbon-icon"]')).toBeNull();
    });
  });
});
