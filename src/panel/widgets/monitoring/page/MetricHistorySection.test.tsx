import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricHistorySection } from './MetricHistorySection';
import type { UseMetricHistoryResult } from '../../../../hooks/useMetricHistory';
import type { UseMetricHistoryAppsResult } from '../../../../hooks/useMetricHistoryApps';
import type { GpuComponent } from '../../../../lib/gpuResolver';

vi.mock('../../../../hooks/useUiSettings', () => ({
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../common/AppPicker', () => ({
  useAppIcon: () => null,
}));

vi.mock('../../../../hooks/useMonitoringPrivacy', () => ({
  useMonitoringPrivacy: () => ({ sessions: [], asOfMs: 0, loading: false, error: false, mocked: false, supported: false }),
}));

const HOUR = 3_600_000;
const NOW = 10_000_000;

function baseHistory(over: Partial<UseMetricHistoryResult> = {}): UseMetricHistoryResult {
  return {
    silhouette: [],
    series: [],
    domain: [NOW - HOUR, NOW],
    stripDomain: [NOW - 3 * HOUR, NOW],
    rangeKey: '3h',
    lastPresetKey: '3h',
    following: true,
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
    backToLive: vi.fn(),
    retry: vi.fn(),
    ...over,
  };
}

function baseAppsWindow(over: Partial<UseMetricHistoryAppsResult> = {}): UseMetricHistoryAppsResult {
  return { apps: [], loading: false, supported: true, mocked: false, ready: true, ...over };
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
  metric?: 'cpu' | 'memory' | 'network' | 'gpu';
  gpuComponents?: readonly GpuComponent[];
  preferredGpuId?: string;
  history?: Partial<UseMetricHistoryResult>;
  appsWindow?: Partial<UseMetricHistoryAppsResult>;
} = {}) {
  return render(
    <MetricHistorySection
      metric={over.metric ?? 'cpu'}
      gpuComponents={over.gpuComponents ?? []}
      preferredGpuId={over.preferredGpuId ?? ''}
      history={baseHistory(over.history)}
      appsWindow={baseAppsWindow(over.appsWindow)}
    />,
  );
}

describe('MetricHistorySection', () => {
  it('renders nothing when supported is false', () => {
    stubGeometry();
    const { container } = renderSection({ history: { supported: false } });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Live badge while following', () => {
    stubGeometry();
    renderSection({ history: { following: true } });
    expect(screen.getByText('monitoring.history.live')).toBeInTheDocument();
  });

  it('renders the live control in its own row above the chart, not overlaid on the plot (item 40)', () => {
    stubGeometry();
    const { container } = renderSection({ history: { following: true } });
    expect(container.querySelector('[class*="liveOverlay"]')).toBeNull();
    expect(container.querySelector('[class*="chartOverlayWrap"]')).toBeNull();
    const liveRow = container.querySelector('[class*="liveRow"]');
    expect(liveRow).toBeInTheDocument();
    expect(liveRow).toContainElement(screen.getByText('monitoring.history.live'));
    // Precedes the chart's own svg in document order (above it, not inside it).
    const svg = container.querySelector('svg')!;
    expect(liveRow!.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sizes the range Select to match the seek-bar block\'s height exactly (item 38)', () => {
    stubGeometry();
    renderSection({ history: { rangeKey: '3h' } });
    const trigger = screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' });
    expect(trigger).toHaveStyle({ height: '40px' });
  });

  it('shows a clickable "back to live" control instead of the badge while detached, and it re-attaches on click', () => {
    stubGeometry();
    const backToLive = vi.fn();
    renderSection({ history: { following: false, backToLive } });
    expect(screen.queryByText('monitoring.history.live')).toBeNull();
    fireEvent.click(screen.getByText('monitoring.history.backToLive'));
    expect(backToLive).toHaveBeenCalled();
  });

  it('shows an error state with a retry action that calls retry()', () => {
    stubGeometry();
    const retry = vi.fn();
    renderSection({ history: { error: true, retry } });
    fireEvent.click(screen.getByText('monitoring.history.retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('is hidden for the gpu metric when no GPU resolves', () => {
    stubGeometry();
    const { container } = renderSection({ metric: 'gpu' });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the matched GPU series by adapterLuid, hiding other GPUs\' data', () => {
    stubGeometry();
    const twoPoints = (base: number) => [{ t: NOW - HOUR, avg: base, max: base + 2 }, { t: NOW, avg: base, max: base + 2 }];
    const series: UseMetricHistoryResult['series'] = [
      { id: 'gpu:0', kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a', points: twoPoints(40) },
      { id: 'gpu:1', kind: 'gpu', name: 'RTX 4090', adapterLuid: 'b', points: twoPoints(90) },
    ];
    const gpuComponents: GpuComponent[] = [{ id: 'gpu/0', name: 'RTX 3070', adapterLuid: 'a', sensors: [] }];
    const { container } = renderSection({ metric: 'gpu', gpuComponents, history: { series } });
    // Only one line drawn (the matched GPU), not both.
    expect(container.querySelectorAll('path[fill="none"]').length).toBe(1);
    expect(container.querySelector('path[stroke="var(--accent)"]')).toBeInTheDocument();
  });

  it('names the network series Download/Upload, sharing the same accent color (no distinct per-series colors)', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'net-in', kind: 'net', name: 'net-in', points: [{ t: NOW - HOUR, avg: 90, max: 110 }, { t: NOW, avg: 100, max: 120 }] },
      { id: 'net-out', kind: 'net', name: 'net-out', points: [{ t: NOW - HOUR, avg: 8, max: 10 }, { t: NOW, avg: 10, max: 12 }] },
    ];
    const { container } = renderSection({ metric: 'network', history: { series } });
    const paths = container.querySelectorAll('path[stroke="var(--accent)"]');
    expect(paths.length).toBe(2);
  });

  it('renders no temperature threshold band, no temp series, and no default avg/max tooltip rows on the main chart (item 30: pure consumption)', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 90, max: 91 }, { t: NOW, avg: 91, max: 92 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series } });
    // The old threshold-band rect (translucent fill at 12% opacity) is gone;
    // TempRibbon still legitimately draws var(--bad) rects below the chart,
    // so the band's own distinguishing attribute is what must be absent.
    expect(container.querySelector('rect[fill-opacity="0.12"]')).toBeNull();
    // Only one line drawn (cpu) - no second line for cpu-temp.
    expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });
    expect(screen.queryByText(/monitoring\.history\.avg/)).toBeNull();
  });

  it('no bottom-left temp badge floats over the chart, and the ribbon itself shows no numeric value (item 41: icon only, value lives in the hover tooltip)', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series } });
    // Not hovering - previously a docked chartOverlayWrap badge showed the
    // temp unconditionally; now nothing outside the tooltip shows it.
    expect(container.querySelector('[class*="tempOverlay"]')).toBeNull();
    expect(screen.queryByText('70°C')).toBeNull();
  });

  it('shows the temperature on the SAME row as the timestamp in the hover tooltip, apps listed below', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
    ];
    const apps = [{ name: 'chrome.exe', avg: 12, max: 15, points: [{ t: NOW, avg: 40 }] }];
    const { container } = renderSection({ metric: 'cpu', history: { series }, appsWindow: { apps } });

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });

    const header = container.querySelector('[class*="tooltipHeader"]')!;
    expect(header.textContent).toContain('70°C');
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
    // The apps row sits in a separate block below the header, not inside it.
    expect(header.textContent).not.toContain('chrome.exe');
  });

  it('shows time+temp in the header and nothing else (no empty apps shell) when the apps endpoint is unsupported', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
    ];
    const { container } = renderSection({
      metric: 'cpu',
      history: { series },
      appsWindow: { supported: false, apps: [{ name: 'chrome.exe', avg: 12, max: 15, points: [{ t: NOW, avg: 40 }] }] },
    });

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });

    const header = container.querySelector('[class*="tooltipHeader"]')!;
    expect(header.textContent).toContain('70°C');
    expect(screen.queryByText('chrome.exe')).toBeNull();
    expect(container.querySelector('[class*="tooltipApps"]')).toBeNull();
    expect(container.querySelector('[class*="tooltipCustom"]')).toBeNull();
  });

  it('the range control is a Select when rangeKey is a named preset, and calls setRange on pick', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { rangeKey: '3h', setRange } });
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.range.24h' }));
    expect(setRange).toHaveBeenCalledWith('24h');
  });

  it('the range control becomes a zoom-out reset button (not the remembered preset label) when rangeKey is custom, restoring the last preset on click', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { rangeKey: 'custom', lastPresetKey: '30m', setRange } });
    expect(screen.queryByRole('button', { name: 'monitoring.history.rangeAriaLabel' })).toBeNull();
    // The button never names the remembered preset (e.g. "30m") - only the
    // fixed zoom-out label, regardless of which preset it will restore.
    expect(screen.queryByText('monitoring.history.range.30m')).toBeNull();
    fireEvent.click(screen.getByText('monitoring.history.zoomOut'));
    expect(setRange).toHaveBeenCalledWith('30m');
  });

  it('a chart drag-select calls onChartDragSelect with the selected range', () => {
    stubGeometry();
    const onChartDragSelect = vi.fn();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series, onChartDragSelect } });
    const svg = container.querySelector('svg')!;

    fireEvent.pointerDown(svg, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, pointerId: 1 });

    expect(onChartDragSelect).toHaveBeenCalledTimes(1);
    const [from, to] = onChartDragSelect.mock.calls[0];
    expect(from).toBeLessThan(to);
  });
});
