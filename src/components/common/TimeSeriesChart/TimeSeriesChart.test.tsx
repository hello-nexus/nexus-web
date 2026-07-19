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

  it('suppresses the isolated single-point dot for a series marked noDots, while a sibling series in the same isolated-point situation still renders its own (item 58 overlay)', () => {
    const points = [
      { t: 0, avg: 40, max: 45 },
      { t: HOUR, avg: 42, max: 46 },
      { t: 20 * HOUR, avg: 90, max: 95 },
      { t: 40 * HOUR, avg: 41, max: 44 },
      { t: 41 * HOUR, avg: 43, max: 47 },
    ];
    const series: TimeSeriesSeries[] = [
      { id: 'cpu', name: 'CPU', color: '#8b5cf6', points },
      { id: 'app', name: 'chrome.exe', color: '#f97316', points, noDots: true },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelector('circle[fill="#8b5cf6"]')).toBeInTheDocument();
    expect(container.querySelector('circle[fill="#f97316"]')).toBeNull();
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

    fireEvent.mouseMove(svg, { clientX: 60 });

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

    fireEvent.mouseMove(svg, { clientX: 60 });

    const tooltipHeader = container.querySelector('[class*="tooltipHeader"]');
    expect(tooltipHeader?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('clears the tooltip on mouse leave', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 60 });
    expect(screen.getByText('Avg 40C')).toBeInTheDocument();

    fireEvent.mouseLeave(svg);
    expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
  });

  describe('hover gutter clamp', () => {
    it('clears the hover cursor/tooltip when the pointer moves into the left axis-label gutter', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 60 });
      expect(screen.getByText('Avg 40C')).toBeInTheDocument();

      // Default left padding is 56px - x=20 sits in the left gutter.
      fireEvent.mouseMove(svg, { clientX: 20 });
      expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
      expect(container.querySelector('line[stroke-dasharray]')).not.toBeInTheDocument();
    });

    it('clears the hover cursor/tooltip when the pointer moves into the right axis-label gutter', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 60 });
      expect(screen.getByText('Avg 40C')).toBeInTheDocument();

      // Default right padding is 16px on a 440px-wide chart - x=430 sits in
      // the right gutter (past width - pad.right = 424).
      fireEvent.mouseMove(svg, { clientX: 430 });
      expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
    });

    it('re-shows the tooltip once the pointer returns to the plot area from a gutter', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 20 });
      expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();

      fireEvent.mouseMove(svg, { clientX: 60 });
      expect(screen.getByText('Avg 40C')).toBeInTheDocument();
    });

    it('uses the yAxisSide=right padding lanes for the gutter clamp (narrow left, wide right)', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} yAxisSide="right" />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 20 });
      expect(screen.getByText('Avg 40C')).toBeInTheDocument();

      // Right-axis padding is { left: 16, right: 80 } - x=370 sits in the
      // (wider) right gutter reserved for the axis labels.
      fireEvent.mouseMove(svg, { clientX: 370 });
      expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();

      // x=5 sits in the (narrow) left gutter.
      fireEvent.mouseMove(svg, { clientX: 5 });
      expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
    });
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

    fireEvent.mouseMove(svg, { clientX: 60 });

    expect(tooltipExtra).toHaveBeenCalledWith(0);
    expect(screen.getByText('extra for 0')).toBeInTheDocument();
  });

  it('renders nothing extra when tooltipExtra returns null', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} tooltipExtra={() => null} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 60 });

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

    fireEvent.mouseMove(svg, { clientX: 60 });

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

    fireEvent.mouseMove(svg, { clientX: 60 });

    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
  });

  it('omitting tooltipExtra does not break the tooltip (backwards compatible)', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 60 });

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

    fireEvent.mouseMove(svg, { clientX: 60 });

    expect(screen.queryByText('Avg 40C')).not.toBeInTheDocument();
    expect(screen.getByText('custom body')).toBeInTheDocument();
  });

  it('renders a filled gradient area per series when fillGradient is set', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} fillGradient />);
    expect(container.querySelectorAll('linearGradient').length).toBe(2);
    expect(container.querySelectorAll('path[fill^="url(#"]').length).toBe(2);
  });

  it('skips the gradient fill for a series marked noFill, while its stroked line still renders (item 49 overlay)', () => {
    const series = makeSeries();
    series[1] = { ...series[1], noFill: true };
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} fillGradient />);
    // Only the non-noFill series gets a gradient def and a fill path.
    expect(container.querySelectorAll('linearGradient').length).toBe(1);
    expect(container.querySelectorAll('path[fill^="url(#"]').length).toBe(1);
    // Both series still draw their own stroked line.
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(1);
    expect(container.querySelectorAll('path[stroke="#22d3ee"]').length).toBe(1);
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
      expect(container.querySelector('line[stroke="var(--text)"][stroke-width="1.5"]')).toBeNull();
    });

    it('renders a persistent solid line at the given timestamp, distinct from the dashed hover cursor', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} selectedT={HOUR} />);
      // The bright text color (not the accent) so the persistent selection
      // stands out from the all-accent chart lines/ribbons.
      const line = container.querySelector('line[stroke="var(--text)"][stroke-width="1.5"]');
      expect(line).toBeInTheDocument();
      expect(line).not.toHaveAttribute('stroke-dasharray');
      expect(line).toHaveAttribute('opacity', '1');
      // At t=HOUR (the midpoint of the 0..2*HOUR domain), the line sits at
      // the plot's horizontal midpoint.
      const x = Number(line!.getAttribute('x1'));
      expect(x).toBeGreaterThan(200);
      expect(x).toBeLessThanOrEqual(240);
    });

    it('renders no line when selectedT is null', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} selectedT={null} />);
      expect(container.querySelector('line[stroke="var(--text)"][stroke-width="1.5"]')).toBeNull();
    });
  });

  describe('singleValueTooltip', () => {
    it('renders one value per series row, with no avg/max labels, when set', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} singleValueTooltip />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 60 });

      // Scoped to the tooltip row itself - "40C" alone can also match a
      // y-axis tick label at the same value.
      const rows = container.querySelectorAll('[class*="tooltipRow"]');
      expect(rows[0].textContent).toBe('CPU40C');
      expect(rows[0].textContent).not.toContain('Avg');
      expect(rows[0].textContent).not.toContain('Max');
    });

    it('keeps the default avg/max pair when singleValueTooltip is omitted (backwards compatible)', () => {
      const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
      const svg = container.querySelector('svg')!;
      vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.mouseMove(svg, { clientX: 60 });

      expect(screen.getByText('Avg 40C')).toBeInTheDocument();
      expect(screen.getByText('Max 45C')).toBeInTheDocument();
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
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      expect(ribbonRects(container).length).toBe(3);
    });

    it('uses a slim default band thickness when the ribbon omits its own height', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      // Pinned so a future edit can't silently widen the temp/RPM bands back
      // out - every caller (MetricHistorySection, CoolingHistorySection)
      // relies on this default rather than passing its own height.
      expect(Number(ribbonRects(container)[0].getAttribute('height'))).toBe(14);
    });

    it('does not draw a bar spanning a gap between ribbon points, matching the line\'s own gap rule', () => {
      // Same gap fixture as the line's own "breaks a series into multiple
      // path segments across a gap" test: an 8-hour gap between p1 and p2,
      // far past the ~1.5x-median-spacing threshold.
      const points = [
        { t: 0, avg: 40, max: 41 },
        { t: HOUR, avg: 50, max: 52 },
        { t: 10 * HOUR, avg: 60, max: 62 },
        { t: 11 * HOUR, avg: 65, max: 67 },
      ];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 11 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
        />,
      );
      // p1 (t=HOUR) is the last point before the gap - no bar spans from it
      // to p2 (t=10*HOUR); only p0-p1, p2-p3, and p3-to-edge remain (not 4).
      expect(ribbonRects(container).length).toBe(3);
    });

    it('renders a thin marker for a ribbon point isolated between two gaps, instead of vanishing', () => {
      // Same fixture as the line's own isolated-point test.
      const points = [
        { t: 0, avg: 40, max: 45 },
        { t: HOUR, avg: 42, max: 46 },
        { t: 20 * HOUR, avg: 90, max: 95 },
        { t: 40 * HOUR, avg: 41, max: 44 },
        { t: 41 * HOUR, avg: 43, max: 47 },
      ];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 41 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
        />,
      );
      // p0-p1, the isolated marker at p2, p3-p4, and p4-to-edge.
      expect(ribbonRects(container).length).toBe(4);
    });

    it('does not extend the last point\'s bar to the right edge across a trailing stale gap (the series stopped reporting well before "now")', () => {
      // Evenly spaced (median spacing = 1h, gap threshold = 1.5h) so the
      // fixture's own gap math is unambiguous; the chart's domain extends 8h
      // past the last real point - far past the threshold.
      const points = [
        { t: 0, avg: 40, max: 41 },
        { t: HOUR, avg: 50, max: 52 },
        { t: 2 * HOUR, avg: 60, max: 62 },
      ];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 10 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
        />,
      );
      // p0-p1 and p1-p2 only - the last point (p2) does not extend forward
      // into the unreported 8h stretch up to the plot's own right edge.
      const rects = ribbonRects(container);
      expect(rects.length).toBe(2);
      const plotRightEdge = Number(container.querySelector('clipPath rect')!.getAttribute('width'))
        + Number(container.querySelector('clipPath rect')!.getAttribute('x'));
      for (const r of rects) {
        expect(Number(r.getAttribute('x')) + Number(r.getAttribute('width'))).toBeLessThan(plotRightEdge);
      }
    });

    it('renders a marker (not an edge-spanning bar) for a stale trailing point isolated by its own leading gap', () => {
      // p1->p2 is a real gap (4h, past the ~3.75h threshold this fixture's
      // own spacing derives); p2 is then also stale relative to a domain end
      // 15h further still - it gets the isolated-point marker treatment, not
      // a bar spanning all the way to the plot's right edge.
      const points = [
        { t: 0, avg: 40, max: 41 },
        { t: HOUR, avg: 42, max: 44 },
        { t: 5 * HOUR, avg: 90, max: 95 },
      ];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 20 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
        />,
      );
      // The p0-p1 bar, plus a marker for p2 - no bar reaches the right edge.
      const rects = ribbonRects(container);
      expect(rects.length).toBe(2);
      const plotRightEdge = Number(container.querySelector('clipPath rect')!.getAttribute('width'))
        + Number(container.querySelector('clipPath rect')!.getAttribute('x'));
      for (const r of rects) {
        expect(Number(r.getAttribute('x')) + Number(r.getAttribute('width'))).toBeLessThan(plotRightEdge);
      }
    });

    it('maps opacity linearly (no amplification) across the ribbon\'s own window-observed range', () => {
      const points = [{ t: 0, avg: 20, max: 20 }, { t: HOUR, avg: 60, max: 60 }, { t: 2 * HOUR, avg: 100, max: 100 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      const opacities = ribbonRects(container).map(r => Number(r.getAttribute('fill-opacity')));
      // 20 is this window's own observed min, 100 its own observed max - 60
      // sits exactly halfway between them, so a linear (non-amplified)
      // mapping puts its opacity exactly halfway between the other two.
      expect(opacities[2]).toBeCloseTo(1, 5);
      expect(opacities[1]).toBeCloseTo((opacities[0] + opacities[2]) / 2, 5);
      expect(opacities[1]).toBeGreaterThan(opacities[0]);
    });

    it('recomputes its opacity range from the ribbon\'s own points, not a fixed shared scale', () => {
      // The middle point (avg 44) sits at the exact midpoint of the narrow
      // fixture's own range [40, 48] but well below the midpoint of the wide
      // fixture's own range [0, 100] - the same absolute value must map to a
      // different opacity in each, since the range adapts to each ribbon's
      // own points rather than a shared fixed scale.
      const narrowPoints = [{ t: 0, avg: 40, max: 40 }, { t: HOUR, avg: 44, max: 44 }, { t: 2 * HOUR, avg: 48, max: 48 }];
      const widePoints = [{ t: 0, avg: 0, max: 0 }, { t: HOUR, avg: 44, max: 44 }, { t: 2 * HOUR, avg: 100, max: 100 }];
      const narrow = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points: narrowPoints, fill: 'var(--bad)' }]} />,
      );
      const wide = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points: widePoints, fill: 'var(--bad)' }]} />,
      );
      const narrowOpacity = Number(ribbonRects(narrow.container)[1].getAttribute('fill-opacity'));
      const wideOpacity = Number(ribbonRects(wide.container)[1].getAttribute('fill-opacity'));
      expect(narrowOpacity).toBeGreaterThan(wideOpacity);
    });

    it('maps a flat window (every point sharing one value) to a constant opacity instead of NaN', () => {
      const points = [{ t: 0, avg: 55, max: 55 }, { t: HOUR, avg: 55, max: 55 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      const opacities = ribbonRects(container).map(r => Number(r.getAttribute('fill-opacity')));
      expect(opacities.length).toBe(2);
      for (const o of opacities) {
        expect(Number.isNaN(o)).toBe(false);
        expect(o).toBeGreaterThan(0);
        expect(o).toBeLessThan(1);
      }
      expect(opacities[0]).toBeCloseTo(opacities[1], 10);
    });

    it('maps a single-point window to a constant opacity instead of NaN', () => {
      const points = [{ t: 0, avg: 55, max: 55 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      const opacity = Number(ribbonRects(container)[0].getAttribute('fill-opacity'));
      expect(Number.isNaN(opacity)).toBe(false);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    });

    it('renders every ribbon rect at the full band height regardless of value (opacity-only modulation, not thickness)', () => {
      const points = [{ t: 0, avg: 0, max: 0 }, { t: HOUR, avg: 100, max: 100 }];
      const { container } = render(
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)', height: 20 }]} />,
      );
      const heights = ribbonRects(container).map(r => Number(r.getAttribute('height')));
      expect(heights[0]).toBeCloseTo(20, 5);
      expect(heights[1]).toBeCloseTo(20, 5);
    });

    it('shares the exact x pixel mapping with the line above it - no separate alignment computation', () => {
      const points = [{ t: 0, avg: 40, max: 41 }, { t: HOUR, avg: 50, max: 52 }, { t: 2 * HOUR, avg: 60, max: 62 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 2 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
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

    it('clips ribbon bars to the plot rect, so a bracketing point before the domain\'s left edge does not bleed into the axis gutter', () => {
      // A bracketing point the fetch returns just before the plotted domain's
      // own start, matching the line/area's own clipping (see the identical
      // <g clipPath> group above it) rather than drawing past pad.left.
      const points = [{ t: -HOUR, avg: 40, max: 41 }, { t: HOUR, avg: 50, max: 52 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} domain={[0, 2 * HOUR]}
          ribbons={[{ points, fill: 'var(--bad)' }]}
        />,
      );
      const clipPathId = container.querySelector('clipPath')!.getAttribute('id');
      const rect = ribbonRects(container)[0];
      const clipGroup = rect.closest('g[clip-path]');
      expect(clipGroup).not.toBeNull();
      expect(clipGroup!.getAttribute('clip-path')).toBe(`url(#${clipPathId})`);
    });

    it('reserves its own height from the line/area\'s own plot range, stacking multiple ribbons in order', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps}
          ribbons={[
            { points, fill: 'var(--bad)', height: 12 },
            { points, fill: 'var(--accent)', height: 12 },
          ]}
        />,
      );
      const first = ribbonRects(container, 'var(--bad)')[0];
      const second = ribbonRects(container, 'var(--accent)')[0];
      const firstMidY = Number(first.getAttribute('y')) + Number(first.getAttribute('height')) / 2;
      const secondMidY = Number(second.getAttribute('y')) + Number(second.getAttribute('height')) / 2;
      expect(secondMidY).toBeGreaterThan(firstMidY);
    });

    it('leaves a visible gap between two stacked bands rather than letting them touch', () => {
      // Every ribbon rect is rendered at its own full reserved band height
      // (opacity-only modulation) - the rect's own edges trace each band's
      // reserved slot exactly, making the gap between them directly
      // observable from the DOM.
      const points = [{ t: 0, avg: 100, max: 100 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps}
          ribbons={[
            { points, fill: 'var(--bad)', height: 12 },
            { points, fill: 'var(--accent)', height: 12 },
          ]}
        />,
      );
      const first = ribbonRects(container, 'var(--bad)')[0];
      const second = ribbonRects(container, 'var(--accent)')[0];
      const firstBottom = Number(first.getAttribute('y')) + Number(first.getAttribute('height'));
      const secondTop = Number(second.getAttribute('y'));
      expect(secondTop).toBeGreaterThan(firstBottom);
    });

    it('reserves clear vertical separation between the line chart baseline and the first ribbon band', () => {
      // A forced yDomain of [0, 100] lands a gridline exactly on the domain
      // floor (niceTicks(0, 100) includes 0 itself), so that gridline's own
      // y is the line chart's true rendered bottom - the first ribbon band's
      // own gap above it is then directly observable, unlike the band's
      // absolute y (which shrinks the line's own plot area by the same gap
      // it adds below it, cancelling out - not a valid regression guard).
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} yDomain={[0, 100]}
          ribbons={[{ points, fill: 'var(--bad)', height: 12 }]}
        />,
      );
      const gridlines = container.querySelectorAll('line[stroke="var(--border)"]');
      const baselineY = Math.max(...Array.from(gridlines).map(l => Number(l.getAttribute('y1'))));
      const rect = ribbonRects(container)[0];
      expect(Number(rect.getAttribute('y')) - baselineY).toBe(12);
    });

    it('renders a valueLabel at the axis label position, on the yAxisSide edge', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps} yAxisSide="right"
          ribbons={[{ points, fill: 'var(--bad)', valueLabel: '61C' }]}
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
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      expect(screen.queryByText('77C')).toBeNull();
    });

    it('renders the icon in the pad lane opposite the axis labels', () => {
      const points = [{ t: 0, avg: 60, max: 60 }];
      const { container } = render(
        <TimeSeriesChart
          series={ribbonSeries} {...baseProps}
          ribbons={[{ points, fill: 'var(--bad)', icon: <circle data-testid="ribbon-icon" r={6} /> }]}
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
          ribbons={[{ points, fill: 'var(--bad)', icon: <circle data-testid="ribbon-icon" r={6} /> }]}
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
        <TimeSeriesChart series={ribbonSeries} {...baseProps} ribbons={[{ points, fill: 'var(--bad)' }]} />,
      );
      expect(container.querySelector('[data-testid="ribbon-icon"]')).toBeNull();
    });
  });

  describe('yTicks below the data minimum', () => {
    // Regression: with no forced yDomain (e.g. the cooling temperature
    // chart), niceTicks can round its floor below the actual series
    // minimum. That tick's gridline/label would land below the line's own
    // plot area - inside a ribbon's gap or band - so it must be dropped
    // rather than rendered.
    const series: TimeSeriesSeries[] = [
      { id: 'drive', name: 'Drive', color: '#69db7c', points: [{ t: 0, avg: 29.4, max: 30 }, { t: HOUR, avg: 78.8, max: 79 }] },
    ];

    it('omits a tick below the series minimum', () => {
      render(<TimeSeriesChart series={series} {...baseProps} />);
      // This fixture's minimum rounds down to a "nice" tick below itself,
      // which must be dropped rather than rendered.
      expect(screen.queryByText('20C')).toBeNull();
    });

    it('keeps ticks at or above the series minimum', () => {
      render(<TimeSeriesChart series={series} {...baseProps} />);
      expect(screen.getByText('30C')).toBeInTheDocument();
    });
  });
});
