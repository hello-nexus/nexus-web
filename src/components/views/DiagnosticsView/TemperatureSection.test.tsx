import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemperatureSection } from './TemperatureSection';
import type { DiagnosticsTemperatureAppsResponse, DiagnosticsTemperaturesResponse } from '../../../api/diagnostics';

function baseData(overrides: Partial<DiagnosticsTemperaturesResponse> = {}): DiagnosticsTemperaturesResponse {
  return {
    supported: true,
    bucketMinutes: 5,
    retentionDays: 90,
    series: [{ id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: 0, avg: 40, max: 45 }] }],
    episodes: [],
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof TemperatureSection>[0]> = {}) {
  const onHoursChange = vi.fn();
  const onDateChange = vi.fn();
  const { container } = render(
    <TemperatureSection
      data={baseData()}
      loading={false}
      error={false}
      mocked={false}
      hours={168}
      date={null}
      onHoursChange={onHoursChange}
      onDateChange={onDateChange}
      onRetry={vi.fn()}
      appUsageData={null}
      {...props}
    />,
  );
  return { onHoursChange, onDateChange, container };
}

// The section also renders the DatePicker's own calendar-glyph <svg> ahead
// of the chart in DOM order, so the chart itself is the LAST svg, not the
// first.
function hoverChartAt(container: HTMLElement, clientX = 0) {
  const svgs = container.querySelectorAll('svg');
  const svg = svgs[svgs.length - 1];
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 440, height: 260, right: 440, bottom: 260, x: 0, y: 0, toJSON: () => ({}),
  });
  fireEvent.mouseMove(svg, { clientX });
}

describe('TemperatureSection range chips', () => {
  it('marks the active hours chip and clicking another reports its hours value', () => {
    const { onHoursChange } = renderSection({ hours: 168 });

    expect(screen.getByRole('button', { name: 'diagnostics.temperature.range.7d' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.temperature.range.24h' }));
    expect(onHoursChange).toHaveBeenCalledWith(24);
  });

  it('deselects every chip visually once a day is active', () => {
    renderSection({ hours: 168, date: '2026-07-05' });

    for (const key of ['24h', '3d', '7d', '14d']) {
      expect(screen.getByRole('button', { name: `diagnostics.temperature.range.${key}` })).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('TemperatureSection day picker', () => {
  it('renders no separate clear-day button in either mode', () => {
    const { rerender } = render(
      <TemperatureSection
        data={baseData()} loading={false} error={false} mocked={false}
        hours={168} date={null} onHoursChange={vi.fn()} onDateChange={vi.fn()} onRetry={vi.fn()}
        appUsageData={null}
      />,
    );
    expect(screen.queryByLabelText('diagnostics.temperature.clearDayAriaLabel')).not.toBeInTheDocument();
    rerender(
      <TemperatureSection
        data={baseData()} loading={false} error={false} mocked={false}
        hours={168} date={'2026-07-05'} onHoursChange={vi.fn()} onDateChange={vi.fn()} onRetry={vi.fn()}
        appUsageData={null}
      />,
    );
    expect(screen.queryByLabelText('diagnostics.temperature.clearDayAriaLabel')).not.toBeInTheDocument();
  });

  it('returns to a relative range by clicking a chip while a day is active', () => {
    const { onHoursChange } = renderSection({ date: '2026-07-05' });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.temperature.range.24h' }));
    expect(onHoursChange).toHaveBeenCalledWith(24);
  });
});

describe('TemperatureSection retention bound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables calendar days older than retentionDays - 1 back from today', () => {
    renderSection({ data: baseData({ retentionDays: 5 }) });

    fireEvent.click(screen.getByLabelText('diagnostics.temperature.dayPickerAriaLabel'));

    // today is 2026-07-15, retentionDays 5 -> earliest selectable is 2026-07-11.
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '11' })).not.toBeDisabled();
  });

  it('falls back to the default retention window before the first response', () => {
    renderSection({ data: null });

    fireEvent.click(screen.getByLabelText('diagnostics.temperature.dayPickerAriaLabel'));

    // Default retention is 90 days, so early July stays selectable. The grid
    // also renders a disabled out-month "1" (the next month's leading day),
    // so assert on the enabled in-month cell rather than a unique match.
    const dayOnes = screen.getAllByRole('button', { name: '1' });
    expect(dayOnes.some(b => !(b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('TemperatureSection hover app breakdown', () => {
  function appsData(overrides: Partial<DiagnosticsTemperatureAppsResponse> = {}): DiagnosticsTemperatureAppsResponse {
    return {
      supported: true,
      bucketMinutes: 5,
      buckets: [
        {
          startUtcMs: 0,
          apps: [
            { appName: 'Google Chrome', appId: 'Google Chrome', ms: 120_000 },
            { appName: 'Steam', appId: 'Steam', ms: 60_000 },
          ],
        },
      ],
      ...overrides,
    };
  }

  it('shows no app rows before hovering', () => {
    renderSection({ appUsageData: appsData() });

    expect(screen.queryByText('Google Chrome')).not.toBeInTheDocument();
  });

  it('shows the hovered bucket\'s apps in the tooltip, dominant first', () => {
    const { container } = renderSection({ appUsageData: appsData() });

    hoverChartAt(container);

    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.getByText('Steam')).toBeInTheDocument();
    expect(screen.getByText('2m')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('shows nothing extra while app usage data has not arrived yet', () => {
    const { container } = renderSection({ appUsageData: null });

    hoverChartAt(container);

    expect(screen.queryByText('Google Chrome')).not.toBeInTheDocument();
  });

  it('shows nothing extra when the service reports screen-time data as unsupported', () => {
    const { container } = renderSection({ appUsageData: appsData({ supported: false }) });

    hoverChartAt(container);

    expect(screen.queryByText('Google Chrome')).not.toBeInTheDocument();
  });
});

describe('TemperatureSection empty day state', () => {
  it('shows a day-specific empty message when the chosen day has no data', () => {
    renderSection({
      date: '2026-07-05',
      data: baseData({ series: [], episodes: [] }),
    });

    expect(screen.getByText('diagnostics.temperature.emptyDay')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.temperature.empty')).not.toBeInTheDocument();
  });

  it('shows the relative-range empty message when no day is active', () => {
    renderSection({
      date: null,
      data: baseData({ series: [], episodes: [] }),
    });

    expect(screen.getByText('diagnostics.temperature.empty')).toBeInTheDocument();
  });
});

describe('TemperatureSection sustained-high callout (warning-linger gate)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const episode = (endUtc: string) => ({
    componentId: 'gpu:0', name: 'GPU', startUtc: '2026-07-11T11:00:00Z', endUtc, peakC: 93, thresholdC: 85,
  });

  it('shows the callout while an episode is active (ended within a bucket of now)', () => {
    // Ends 1 min ago, inside bucketMinutes(5) - a current warning even at the
    // default linger of 0.
    renderSection({ data: baseData({ episodes: [episode('2026-07-11T11:59:00Z')] }) });
    expect(screen.getByText('diagnostics.temperature.episodesTitle')).toBeInTheDocument();
  });

  it('hides the callout for an episode that ended long ago (linger 0)', () => {
    // Ended 3 hours ago, well past bucketMinutes; nothing lingers -> hidden,
    // even though the chart band for it still renders.
    renderSection({ data: baseData({ episodes: [episode('2026-07-11T09:00:00Z')] }) });
    expect(screen.queryByText('diagnostics.temperature.episodesTitle')).not.toBeInTheDocument();
  });
});
