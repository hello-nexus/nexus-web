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

  it('shows a clickable "back to live" control instead of the badge while detached, and it re-attaches on click', () => {
    stubGeometry();
    const backToLive = vi.fn();
    renderSection({ history: { following: false, backToLive } });
    expect(screen.queryByText('monitoring.history.live')).toBeNull();
    fireEvent.click(screen.getByText('monitoring.history.backToLive'));
    expect(backToLive).toHaveBeenCalled();
  });

  it('shows the mocked badge when the data is dev-mocked', () => {
    stubGeometry();
    renderSection({ history: { mocked: true } });
    expect(screen.getByText('monitoring.history.mocked')).toBeInTheDocument();
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

  it('renders a temperature threshold band for the cpu metric, with no default avg/max tooltip rows', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 90, max: 91 }, { t: NOW, avg: 91, max: 92 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series } });
    expect(container.querySelector('rect[fill="var(--bad)"]')).toBeInTheDocument();

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });
    expect(screen.queryByText(/monitoring\.history\.avg/)).toBeNull();
  });

  it('shows the temperature and top apps in the hover tooltip for cpu', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
    ];
    const apps = [{ name: 'chrome.exe', avg: 12, max: 15, points: [{ t: NOW, avg: 40 }] }];
    const { container } = renderSection({ metric: 'cpu', history: { series }, appsWindow: { apps } });

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });

    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
  });

  it('hides the apps section but keeps the temp row when the apps endpoint is unsupported', () => {
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

    expect(screen.queryByText('chrome.exe')).toBeNull();
  });

  it('the range control is a Select when rangeKey is a named preset, and calls setRange on pick', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { rangeKey: '3h', setRange } });
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.range.1h' }));
    expect(setRange).toHaveBeenCalledWith('1h');
  });

  it('the range control becomes a reset button naming the last preset when rangeKey is custom', () => {
    stubGeometry();
    const setRange = vi.fn();
    renderSection({ history: { rangeKey: 'custom', lastPresetKey: '5m', setRange } });
    expect(screen.queryByRole('button', { name: 'monitoring.history.rangeAriaLabel' })).toBeNull();
    fireEvent.click(screen.getByText('monitoring.history.range.5m'));
    expect(setRange).toHaveBeenCalledWith('5m');
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
