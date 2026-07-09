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

  it('shows a per-series avg/max tooltip on hover', () => {
    const { container } = render(<TimeSeriesChart series={makeSeries()} {...baseProps} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseMove(svg, { clientX: 0 });

    // "T0" also appears as the leftmost x-axis tick label, so scope the
    // header check to the tooltip itself instead of screen.getByText.
    const tooltipHeader = container.querySelector('[class*="tooltipHeader"]');
    expect(tooltipHeader).toHaveTextContent('T0');
    expect(screen.getByText('Avg 40C')).toBeInTheDocument();
    expect(screen.getByText('Max 45C')).toBeInTheDocument();
    expect(screen.getByText('Avg 35C')).toBeInTheDocument();
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
});
