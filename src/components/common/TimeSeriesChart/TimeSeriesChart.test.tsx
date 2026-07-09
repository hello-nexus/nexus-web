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
  bucketMinutes: 60,
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
        ],
      },
    ];
    const { container } = render(<TimeSeriesChart series={series} {...baseProps} />);
    expect(container.querySelectorAll('path[stroke="#8b5cf6"]').length).toBe(2);
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
