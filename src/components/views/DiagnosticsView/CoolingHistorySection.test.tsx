import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoolingHistorySection } from './CoolingHistorySection';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import type { DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
import { formatSelectedFrameTime } from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';

const HOUR = 3_600_000;
const NOW = 10_000_000;

// CoolingHistorySection has no per-frame click-to-pin, so its detached chip
// always shows the viewed window's right edge (baseHistory's default domain),
// formatted with seconds (finer than the x-axis ticks).
const DETACHED_LABEL = formatSelectedFrameTime(NOW, HOUR, 'system');

const SAMPLE_SERIES: UseMetricHistoryResult['series'] = [
  { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
];

function baseHistory(over: Partial<UseMetricHistoryResult> = {}): UseMetricHistoryResult {
  return {
    silhouette: [],
    series: [],
    domain: [NOW - HOUR, NOW],
    stripDomain: [NOW - 3 * HOUR, NOW],
    rangeKey: '3h',
    lastPresetKey: '3h',
    following: true,
    dragging: false,
    loading: false,
    error: false,
    mocked: false,
    supported: true,
    retentionDays: 7,
    stepSeconds: 1,
    viewportGeneration: 0,
    setRange: vi.fn(),
    onBrushChange: vi.fn(),
    onChartDragSelect: vi.fn(),
    onChartWheelZoom: vi.fn(),
    detach: vi.fn(),
    backToLive: vi.fn(),
    retry: vi.fn(),
    ...over,
  };
}

function stubGeometry() {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 40, width: 400, height: 40, toJSON: () => ({}),
  } as DOMRect);
}

function renderSection(over: {
  history?: Partial<UseMetricHistoryResult>;
  episodes?: readonly DiagnosticsTemperatureEpisode[];
} = {}) {
  return render(<CoolingHistorySection history={baseHistory(over.history)} episodes={over.episodes} />);
}

// The header's Radio icon, the ribbon's Fan icon, and TimelineBrush's own
// seek-bar svg are all also <svg> elements in this tree - select
// TimeSeriesChart's plot specifically via its distinctive chartWrap wrapper.
function chartSvg(container: HTMLElement): SVGSVGElement {
  return container.querySelector('[class*="chartWrap"] > svg') as SVGSVGElement;
}

describe('CoolingHistorySection', () => {
  it('shows an unsupported message in a fixed-height box instead of collapsing when supported is false', () => {
    stubGeometry();
    renderSection({ history: { supported: false } });
    expect(screen.getByText('monitoring.history.unsupported')).toBeInTheDocument();
  });

  it('shows an error state with a retry action that calls retry()', () => {
    stubGeometry();
    const retry = vi.fn();
    renderSection({ history: { error: true, retry } });
    fireEvent.click(screen.getByText('monitoring.history.retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('shows the empty state when nothing is reported at all', () => {
    stubGeometry();
    renderSection({ history: { series: [], silhouette: [] } });
    expect(screen.getByText('diagnostics.temperature.empty')).toBeInTheDocument();
  });

  describe('fixed-height chart box (no first-frame flicker)', () => {
    // Every non-chart state reserves the exact same box height as the chart
    // itself (CHART_HEIGHT), so switching between them never resizes the
    // section - only an inline style height is set on this reserved box.
    function boxHeight(container: HTMLElement): string {
      const box = container.querySelector('[style*="height"]') as HTMLElement | null;
      return box?.style.height ?? '';
    }

    it('reserves the same box height across the error, unsupported, and no-data states', () => {
      stubGeometry();
      const { container: errorBox } = renderSection({ history: { error: true } });
      const { container: unsupportedBox } = renderSection({ history: { supported: false } });
      const { container: emptyBox } = renderSection({ history: { series: [], silhouette: [] } });
      const { container: loadingBox } = renderSection({ history: { loading: true } });

      expect(boxHeight(errorBox)).toBe('246px');
      expect(boxHeight(unsupportedBox)).toBe('246px');
      expect(boxHeight(emptyBox)).toBe('246px');
      expect(boxHeight(loadingBox)).toBe('246px');
    });
  });

  it('renders the temperature axis on the right, matching the monitoring hero chart', () => {
    stubGeometry();
    const { container } = renderSection({ history: { series: SAMPLE_SERIES } });
    const svg = chartSvg(container);
    // yAxisSide='right' swaps the padding lanes - the plot's left edge sits
    // at the narrow lane instead of the (wider) axis-label lane.
    const clipRect = svg.querySelector('clipPath rect')!;
    expect(Number(clipRect.getAttribute('x'))).toBe(16);
  });

  it('shows a single temperature value per series in the hover tooltip, not an avg/max pair', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 52, max: 58 }] },
    ];
    const { container } = renderSection({ history: { series, domain: [NOW - HOUR, NOW] } });
    fireEvent.mouseMove(chartSvg(container), { clientX: 200 });
    // Scoped to the tooltip row itself - "52°C" alone can also match a
    // y-axis tick label at the same value.
    const row = container.querySelector('[class*="tooltipRow"]')!;
    expect(row.textContent).toBe('CPU52°C');
    expect(row.textContent).not.toContain('58');
    expect(row.textContent).not.toContain('diagnostics.temperature.avg');
    expect(row.textContent).not.toContain('diagnostics.temperature.max');
  });

  it('shows the mocked badge only when history.mocked', () => {
    stubGeometry();
    const { rerender } = render(<CoolingHistorySection history={baseHistory({ series: SAMPLE_SERIES, mocked: false })} />);
    expect(screen.queryByText('diagnostics.mockDataBadge')).not.toBeInTheDocument();
    rerender(<CoolingHistorySection history={baseHistory({ series: SAMPLE_SERIES, mocked: true })} />);
    expect(screen.getByText('diagnostics.mockDataBadge')).toBeInTheDocument();
  });

  it('renders one colored line per temperature kind (cpu/gpu/mem/drive), skipping the fan kind', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      { id: 'gpu-temp:0', kind: 'gpu-temp', name: 'GPU', points: [{ t: NOW - HOUR, avg: 45, max: 46 }, { t: NOW, avg: 55, max: 56 }] },
      { id: 'mem-temp', kind: 'mem-temp', name: 'Memory', points: [{ t: NOW - HOUR, avg: 38, max: 39 }, { t: NOW, avg: 39, max: 40 }] },
      { id: 'drive-temp:0', kind: 'drive-temp', name: 'SSD 0', points: [{ t: NOW - HOUR, avg: 33, max: 34 }, { t: NOW, avg: 34, max: 35 }] },
      { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW - HOUR, avg: 1200, max: 1250 }, { t: NOW, avg: 1600, max: 1650 }] },
    ];
    const { container } = renderSection({ history: { series } });
    // Four lines (one per temp kind) - fan renders as a ribbon, not a line.
    expect(container.querySelectorAll('path[stroke-width="1.6"]').length).toBe(4);
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('GPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('SSD 0')).toBeInTheDocument();
  });

  it('renders no fan-speed band when there is no fan series', () => {
    stubGeometry();
    const { container } = renderSection({ history: { series: SAMPLE_SERIES } });
    expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
  });

  it('renders a fan-speed band averaged across every fan series (RPM), with a text readout instead of an icon', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      ...SAMPLE_SERIES,
      { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW, avg: 1200, max: 1250 }] },
      { id: 'fan:2', kind: 'fan', name: 'Fan 2', points: [{ t: NOW, avg: 1600, max: 1580 }] },
    ];
    const { container } = renderSection({ history: { series } });
    expect(container.querySelector('rect[fill="var(--accent)"]')).toBeInTheDocument();
    expect(screen.getByText('1400 RPM')).toBeInTheDocument();
  });

  it('shows the average fan speed (RPM) on the same row as the timestamp in the hover tooltip', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW, avg: 1500, max: 1520 }] },
    ];
    const { container } = renderSection({ history: { series, domain: [NOW - HOUR, NOW] } });
    fireEvent.mouseMove(chartSvg(container), { clientX: 200 });
    const header = container.querySelector('[class*="tooltipHeader"]')!;
    expect(header.textContent).toContain('1500 RPM');
  });

  it('renders a translucent band for a passed episode', () => {
    stubGeometry();
    const episode: DiagnosticsTemperatureEpisode = {
      componentId: 'gpu:0', name: 'GPU', startUtc: new Date(NOW - HOUR).toISOString(), endUtc: new Date(NOW).toISOString(),
      peakC: 93, thresholdC: 85,
    };
    const { container } = renderSection({ history: { series: SAMPLE_SERIES }, episodes: [episode] });
    expect(container.querySelector('rect[fill-opacity="0.12"]')).toBeInTheDocument();
  });

  it('renders no band when no episodes are passed', () => {
    stubGeometry();
    const { container } = renderSection({ history: { series: SAMPLE_SERIES } });
    expect(container.querySelector('rect[fill-opacity="0.12"]')).toBeNull();
  });

  it('the range control is a Select when rangeKey is a named preset, and calls setRange on pick', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { series: SAMPLE_SERIES, rangeKey: '3h', setRange } });
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.range.24h' }));
    expect(setRange).toHaveBeenCalledWith('24h');
  });

  it('the range control becomes a zoom-out reset button when rangeKey is custom, restoring the last preset on click', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { series: SAMPLE_SERIES, rangeKey: 'custom', lastPresetKey: '30m', setRange } });
    expect(screen.queryByRole('button', { name: 'monitoring.history.rangeAriaLabel' })).toBeNull();
    fireEvent.click(screen.getByText('monitoring.history.zoomOut'));
    expect(setRange).toHaveBeenCalledWith('30m');
  });

  it('a chart drag-select calls onChartDragSelect with the selected range', () => {
    stubGeometry();
    const onChartDragSelect = vi.fn();
    const { container } = renderSection({ history: { series: SAMPLE_SERIES, onChartDragSelect } });
    const svg = chartSvg(container);

    fireEvent.pointerDown(svg, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, pointerId: 1 });

    expect(onChartDragSelect).toHaveBeenCalledTimes(1);
    const [from, to] = onChartDragSelect.mock.calls[0];
    expect(from).toBeLessThan(to);
  });

  it('shows the Live badge while following, and the viewed time with a return arrow once detached', () => {
    stubGeometry();
    const backToLive = vi.fn();
    const { rerender } = render(<CoolingHistorySection history={baseHistory({ following: true, backToLive })} />);
    const liveBadgeSlot = screen.getByText('monitoring.history.live').closest('span[aria-hidden]');
    expect(liveBadgeSlot).toHaveAttribute('aria-hidden', 'false');
    const detachedButton = screen.getByText(DETACHED_LABEL).closest('button')!;
    expect(detachedButton).toHaveAttribute('aria-hidden', 'true');

    rerender(<CoolingHistorySection history={baseHistory({ following: false, backToLive })} />);
    expect(detachedButton).toHaveAttribute('aria-hidden', 'false');
    expect(detachedButton.querySelector('svg')).not.toBeNull();
    fireEvent.click(detachedButton);
    expect(backToLive).toHaveBeenCalled();
  });
});
