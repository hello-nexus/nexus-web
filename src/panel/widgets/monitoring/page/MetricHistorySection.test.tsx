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
  selectedFrameMs?: number;
  onGraphClick?: (t: number) => void;
} = {}) {
  const history = baseHistory(over.history);
  return render(
    <MetricHistorySection
      metric={over.metric ?? 'cpu'}
      gpuComponents={over.gpuComponents ?? []}
      preferredGpuId={over.preferredGpuId ?? ''}
      history={history}
      appsWindow={baseAppsWindow(over.appsWindow)}
      selectedFrameMs={over.selectedFrameMs ?? history.domain[1]}
      onGraphClick={over.onGraphClick ?? vi.fn()}
    />,
  );
}

describe('MetricHistorySection', () => {
  it('renders nothing when supported is false', () => {
    stubGeometry();
    const { container } = renderSection({ history: { supported: false } });
    expect(container).toBeEmptyDOMElement();
  });

  it('sizes the range Select to match the seek-bar block\'s height exactly (item 38)', () => {
    stubGeometry();
    renderSection({ history: { rangeKey: '3h' } });
    const trigger = screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' });
    expect(trigger).toHaveStyle({ height: '40px' });
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

  it('freezes the adaptive Y ceiling for the whole of an active drag, only recomputing once it settles', () => {
    stubGeometry();
    const highSeries: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 40 }, { t: NOW, avg: 90, max: 90 }] },
    ];
    const { rerender } = renderSection({ metric: 'cpu', history: { series: highSeries, dragging: false } });
    // A 90% peak (with headroom) lands in the 100% bucket.
    expect(screen.getByText('100%')).toBeInTheDocument();

    const lowSeries: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 2, max: 2 }, { t: NOW, avg: 3, max: 3 }] },
    ];
    rerender(
      <MetricHistorySection
        metric="cpu"
        gpuComponents={[]}
        preferredGpuId=""
        history={baseHistory({ series: lowSeries, dragging: true })}
        appsWindow={baseAppsWindow()}
        selectedFrameMs={NOW}
        onGraphClick={vi.fn()}
      />,
    );
    // Still frozen at the 100% bucket even though this tick's own (coarser,
    // during-drag) data would only need the 10% one - the axis must not
    // wobble mid-drag.
    expect(screen.getByText('100%')).toBeInTheDocument();

    rerender(
      <MetricHistorySection
        metric="cpu"
        gpuComponents={[]}
        preferredGpuId=""
        history={baseHistory({ series: lowSeries, dragging: false })}
        appsWindow={baseAppsWindow()}
        selectedFrameMs={NOW}
        onGraphClick={vi.fn()}
      />,
    );
    // Settles cleanly to the lower ceiling in a single transition once the
    // drag ends.
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.queryByText('100%')).toBeNull();
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
    // the temp ribbon still legitimately draws opaque var(--bad) rects
    // inside the plot, so the band's own distinguishing attribute (opacity)
    // is what must be absent.
    expect(container.querySelector('rect[fill-opacity="0.12"]')).toBeNull();
    // Only one line drawn (cpu) - no second line for cpu-temp.
    expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 0 });
    expect(screen.queryByText(/monitoring\.history\.avg/)).toBeNull();
  });

  it('shows no floating overlay badge over the chart; the ribbon\'s own right-side readout shows the current temp instead (item R6)', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series } });
    // Not hovering - previously a docked chartOverlayWrap badge showed the
    // temp unconditionally; that floating overlay is gone.
    expect(container.querySelector('[class*="tempOverlay"]')).toBeNull();
    // The ribbon renders its own right-side value label (same lane as the
    // y-axis ticks), not a floating badge.
    expect(screen.getByText('70°C')).toBeInTheDocument();
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

  describe('point-in-time snapshot', () => {
    it('a plain chart click (no drag) calls onGraphClick with the clicked timestamp', () => {
      stubGeometry();
      const onGraphClick = vi.fn();
      const onChartDragSelect = vi.fn();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series, onChartDragSelect }, onGraphClick });
      const svg = container.querySelector('svg')!;

      fireEvent.pointerDown(svg, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 201, pointerId: 1 });

      expect(onGraphClick).toHaveBeenCalledTimes(1);
      expect(onChartDragSelect).not.toHaveBeenCalled();
    });

    it('the ribbon and main-series value readouts reflect the selected frame, not necessarily the newest point', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 90, max: 91 }] },
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 50, max: 51 }, { t: NOW, avg: 80, max: 81 }] },
      ];
      renderSection({ metric: 'cpu', history: { series }, selectedFrameMs: NOW - HOUR });
      // Selected frame is the OLDER point - the readouts must reflect it
      // (40%, 50°C), not the newer one (90%, 80°C).
      expect(screen.getByText('40%')).toBeInTheDocument();
      expect(screen.getByText('50°C')).toBeInTheDocument();
      expect(screen.queryByText('90%')).toBeNull();
      expect(screen.queryByText('80°C')).toBeNull();
    });
  });
});
