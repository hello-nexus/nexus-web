import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricHistorySection } from './MetricHistorySection';
import type { UseMetricHistoryResult } from '../../../../hooks/useMetricHistory';
import type { UseMetricHistoryAppsResult } from '../../../../hooks/useMetricHistoryApps';
import type { GpuComponent } from '../../../../lib/gpuResolver';
import type { FanRoleMap } from './metricHistoryHelpers';

vi.mock('../../../../hooks/useUiSettings', () => ({
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    // Params-aware so a test can assert both which key fired (e.g. the
    // marked-fans tooltip vs the mark-in-Cooling hint) and, for the one
    // interpolated key (rpm.markedFans), the actual joined names.
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
    language: 'en',
  }),
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
    detach: vi.fn(),
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
  metric?: 'cpu' | 'memory' | 'storage' | 'network' | 'gpu';
  gpuComponents?: readonly GpuComponent[];
  preferredGpuId?: string;
  history?: Partial<UseMetricHistoryResult>;
  appsWindow?: Partial<UseMetricHistoryAppsResult>;
  fanRoles?: FanRoleMap;
  selectedFrameMs?: number;
  onGraphClick?: (t: number) => void;
  selectedAppName?: string | null;
  memoryTotalMb?: number | null;
} = {}) {
  const history = baseHistory(over.history);
  return render(
    <MetricHistorySection
      metric={over.metric ?? 'cpu'}
      gpuComponents={over.gpuComponents ?? []}
      preferredGpuId={over.preferredGpuId ?? ''}
      history={history}
      appsWindow={baseAppsWindow(over.appsWindow)}
      fanRoles={over.fanRoles ?? new Map()}
      selectedFrameMs={over.selectedFrameMs ?? history.domain[1]}
      onGraphClick={over.onGraphClick ?? vi.fn()}
      selectedAppName={over.selectedAppName ?? null}
      memoryTotalMb={over.memoryTotalMb ?? null}
    />,
  );
}

describe('MetricHistorySection', () => {
  it('shows an unsupported message in a fixed-height box instead of collapsing when supported is false', () => {
    stubGeometry();
    renderSection({ history: { supported: false } });
    expect(screen.getByText('monitoring.history.unsupported')).toBeInTheDocument();
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

  it('shows a GPU-unavailable message in a fixed-height box instead of collapsing when no GPU resolves', () => {
    stubGeometry();
    renderSection({ metric: 'gpu' });
    expect(screen.getByText('monitoring.history.gpuUnavailable')).toBeInTheDocument();
  });

  it('prefers the actionable error/retry state over the GPU-unavailable message when both apply (a failed fetch also leaves no GPU series to resolve)', () => {
    stubGeometry();
    renderSection({ metric: 'gpu', history: { error: true } });
    expect(screen.getByText('monitoring.history.error')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.history.gpuUnavailable')).toBeNull();
  });

  describe('fixed-height chart box (no first-frame flicker)', () => {
    // Every non-chart state reserves the exact same box height as the chart
    // itself (CHART_HEIGHT), so switching between them never resizes the
    // section - only an inline style height is set on this reserved box.
    function boxHeight(container: HTMLElement): string {
      const box = container.querySelector('[style*="height"]') as HTMLElement | null;
      return box?.style.height ?? '';
    }

    it('reserves the same box height across the error, unsupported, gpu-unavailable, and loading states', () => {
      stubGeometry();
      const { container: errorBox } = renderSection({ history: { error: true } });
      const { container: unsupportedBox } = renderSection({ history: { supported: false } });
      const { container: gpuBox } = renderSection({ metric: 'gpu' });
      const { container: loadingBox } = renderSection({ history: { loading: true } });

      expect(boxHeight(errorBox)).toBe('238px');
      expect(boxHeight(unsupportedBox)).toBe('238px');
      expect(boxHeight(gpuBox)).toBe('238px');
      expect(boxHeight(loadingBox)).toBe('238px');
    });
  });

  describe('adaptive Y ceiling: frozen through a drag AND the release-to-settle window (no flash)', () => {
    const highSeries: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 40 }, { t: NOW, avg: 90, max: 90 }] },
    ];
    const lowSeries: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 2, max: 2 }, { t: NOW, avg: 3, max: 3 }] },
    ];

    function rerenderWith(rerender: ReturnType<typeof render>['rerender'], over: Partial<UseMetricHistoryResult>) {
      rerender(
        <MetricHistorySection
          metric="cpu"
          gpuComponents={[]}
          preferredGpuId=""
          history={baseHistory(over)}
          appsWindow={baseAppsWindow()}
          fanRoles={new Map()}
          selectedFrameMs={NOW}
          onGraphClick={vi.fn()}
          selectedAppName={null}
          memoryTotalMb={null}
        />,
      );
    }

    it('freezes for the whole drag, stays frozen through release until the settled fetch lands, then recomputes once', () => {
      stubGeometry();
      const { rerender } = renderSection({ metric: 'cpu', history: { series: highSeries, dragging: false, loading: false } });
      // A 90% peak (with headroom) lands in the 100% bucket.
      expect(screen.getByText('100%')).toBeInTheDocument();

      // Mid-drag: this tick's own (panned) data would only need the 10%
      // bucket - the axis must not wobble mid-drag.
      rerenderWith(rerender, { series: lowSeries, dragging: true, loading: false });
      expect(screen.getByText('100%')).toBeInTheDocument();

      // Released. `series` is still the drag's last panned/clipped slice and
      // `loading` hasn't flipped true yet (the settle fetch's effect hasn't
      // run) - the exact transient frame that used to flash a smaller
      // ceiling. Must still read 100%.
      rerenderWith(rerender, { series: lowSeries, dragging: false, loading: false });
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.queryByText('10%')).toBeNull();

      // The settle fetch is now in flight.
      rerenderWith(rerender, { series: lowSeries, dragging: false, loading: true });
      expect(screen.getByText('100%')).toBeInTheDocument();

      // Settled: the fetch for the released window landed and confirms the
      // lower peak - recomputes cleanly to 10%, in a single transition.
      rerenderWith(rerender, { series: lowSeries, dragging: false, loading: false });
      expect(screen.getByText('10%')).toBeInTheDocument();
      expect(screen.queryByText('100%')).toBeNull();
    });

    it('does not recompute (and so does not flash) when the settled window has the same peak as the frozen one', () => {
      stubGeometry();
      const { rerender } = renderSection({ metric: 'cpu', history: { series: highSeries, dragging: false, loading: false } });
      expect(screen.getByText('100%')).toBeInTheDocument();

      rerenderWith(rerender, { series: highSeries, dragging: true, loading: false });
      rerenderWith(rerender, { series: highSeries, dragging: false, loading: false });
      expect(screen.getByText('100%')).toBeInTheDocument();
      rerenderWith(rerender, { series: highSeries, dragging: false, loading: true });
      expect(screen.getByText('100%')).toBeInTheDocument();
      rerenderWith(rerender, { series: highSeries, dragging: false, loading: false });
      // Still 100% throughout - never dipped to a different bucket.
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
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

  describe('gpu per-app hover breakdown', () => {
    it('shows each app\'s GPU load AND VRAM (MB/GB), mirroring the CPU tab\'s hover', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'gpu:0', kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a', points: [{ t: NOW, avg: 50, max: 55 }] },
      ];
      const gpuComponents: GpuComponent[] = [{ id: 'gpu/0', name: 'RTX 3070', adapterLuid: 'a', sensors: [] }];
      const apps = [{ name: 'chrome.exe', avg: 30, max: 40, points: [{ t: NOW, avg: 30 }], vramAvgMb: 512 }];
      const { container } = renderSection({ metric: 'gpu', gpuComponents, history: { series }, appsWindow: { apps } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });

      expect(screen.getByText('chrome.exe')).toBeInTheDocument();
      expect(screen.getByText('30%')).toBeInTheDocument();
      expect(screen.getByText('512 MB')).toBeInTheDocument();
    });

    it('renders no VRAM figure for an app with no vramAvgMb (backwards compatible)', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'gpu:0', kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a', points: [{ t: NOW, avg: 50, max: 55 }] },
      ];
      const gpuComponents: GpuComponent[] = [{ id: 'gpu/0', name: 'RTX 3070', adapterLuid: 'a', sensors: [] }];
      const apps = [{ name: 'chrome.exe', avg: 30, max: 40, points: [{ t: NOW, avg: 30 }] }];
      const { container } = renderSection({ metric: 'gpu', gpuComponents, history: { series }, appsWindow: { apps } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });

      expect(screen.getByText('30%')).toBeInTheDocument();
      expect(container.querySelector('[class*="tooltipAppVram"]')).toBeNull();
    });
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

  it('shows the download/upload hover values on two separate labeled lines, not a combined readout', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'net-in', kind: 'net', name: 'net-in', points: [{ t: NOW, avg: 2 * 1024 * 1024, max: 2 * 1024 * 1024 }] },
      { id: 'net-out', kind: 'net', name: 'net-out', points: [{ t: NOW, avg: 500, max: 500 }] },
    ];
    const { container } = renderSection({ metric: 'network', history: { series } });
    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 200 });

    const topRow = container.querySelector('[class*="tooltipTopRow"]')!;
    // Two distinct child rows, not one blob of text combining both values.
    expect(topRow.children.length).toBe(2);
    expect(topRow.children[0].textContent).toBe('monitoring.history.download 2.0 MB/s');
    expect(topRow.children[1].textContent).toBe('monitoring.history.upload 500 B/s');
  });

  describe('storage tab (disk read/write, mirroring network)', () => {
    it('names the disk series Read/Write, sharing the same accent color (two lines, no distinct per-series colors)', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'disk-read', kind: 'disk', name: 'disk-read', points: [{ t: NOW - HOUR, avg: 900_000, max: 1_100_000 }, { t: NOW, avg: 1_000_000, max: 1_200_000 }] },
        { id: 'disk-write', kind: 'disk', name: 'disk-write', points: [{ t: NOW - HOUR, avg: 80_000, max: 100_000 }, { t: NOW, avg: 100_000, max: 120_000 }] },
      ];
      const { container } = renderSection({ metric: 'storage', history: { series } });
      const paths = container.querySelectorAll('path[stroke="var(--accent)"]');
      expect(paths.length).toBe(2);
    });

    it('shows the read/write hover values, formatted as a rate, disambiguating the two curves', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'disk-read', kind: 'disk', name: 'disk-read', points: [{ t: NOW, avg: 2 * 1024 * 1024, max: 2 * 1024 * 1024 }] },
        { id: 'disk-write', kind: 'disk', name: 'disk-write', points: [{ t: NOW, avg: 500, max: 500 }] },
      ];
      const { container } = renderSection({ metric: 'storage', history: { series } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });
      expect(screen.getByText(/monitoring\.history\.read/)).toHaveTextContent('2.0 MB/s');
      expect(screen.getByText(/monitoring\.history\.write/)).toHaveTextContent('500 B/s');
    });

    it('renders no temperature or fan-speed ribbon (disk has neither)', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'disk-read', kind: 'disk', name: 'disk-read', points: [{ t: NOW, avg: 1_000_000, max: 1_000_000 }] },
        { id: 'disk-write', kind: 'disk', name: 'disk-write', points: [{ t: NOW, avg: 500_000, max: 500_000 }] },
      ];
      const { container } = renderSection({ metric: 'storage', history: { series } });
      expect(container.querySelector('rect[fill="var(--bad)"]')).toBeNull();
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
    });
  });

  it('renders no temperature threshold band, no temp series, and no default avg/max tooltip rows on the main chart (item 30: pure consumption)', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 90, max: 91 }, { t: NOW, avg: 91, max: 92 }] },
    ];
    const { container } = renderSection({ metric: 'cpu', history: { series } });
    // The old threshold-band rect (translucent fill at a fixed 12% opacity)
    // is gone; the temp ribbon still legitimately draws var(--accent) rects
    // with their own per-segment (non-fixed) fill-opacity inside the plot,
    // so the old band's own fixed 12% value is what must be absent.
    expect(container.querySelector('rect[fill-opacity="0.12"]')).toBeNull();
    // Only one line drawn (cpu) - no second line for cpu-temp.
    expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);

    const svg = container.querySelector('svg')!;
    fireEvent.mouseMove(svg, { clientX: 200 });
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
    fireEvent.mouseMove(svg, { clientX: 200 });

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
    fireEvent.mouseMove(svg, { clientX: 200 });

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

    it('the temp ribbon readout reflects the selected frame, not necessarily the newest point', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 90, max: 91 }] },
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 50, max: 51 }, { t: NOW, avg: 80, max: 81 }] },
      ];
      renderSection({ metric: 'cpu', history: { series }, selectedFrameMs: NOW - HOUR });
      // Selected frame is the OLDER point - the readout must reflect it
      // (50°C), not the newer one (80°C).
      expect(screen.getByText('50°C')).toBeInTheDocument();
      expect(screen.queryByText('80°C')).toBeNull();
    });
  });

  describe('memory per-app hover breakdown', () => {
    it('formats the per-app hover values as memory (MB/GB), not percent', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 1200, max: 1500, points: [{ t: NOW, avg: 1200 }] }];
      const { container } = renderSection({ metric: 'memory', history: { series }, appsWindow: { apps } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });

      expect(screen.getByText('chrome.exe')).toBeInTheDocument();
      expect(screen.getByText('1.2 GB')).toBeInTheDocument();
      expect(screen.queryByText('1200%')).toBeNull();
    });

    it('renders a sub-1GB per-app value in MB', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
      ];
      const apps = [{ name: 'Nexus', avg: 210, max: 260, points: [{ t: NOW, avg: 210 }] }];
      const { container } = renderSection({ metric: 'memory', history: { series }, appsWindow: { apps } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });

      expect(screen.getByText('210 MB')).toBeInTheDocument();
    });
  });

  describe('memory temperature ribbon', () => {
    it('renders a temp band on the memory tab when a mem-temp series is present', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
        { id: 'mem-temp', kind: 'mem-temp', name: 'Memory Temperature', points: [{ t: NOW, avg: 45, max: 46 }] },
      ];
      const { container } = renderSection({ metric: 'memory', history: { series } });
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeInTheDocument();
      expect(screen.getByText('45°C')).toBeInTheDocument();
    });

    it('renders no temp band on the memory tab when there is no mem-temp series', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
      ];
      const { container } = renderSection({ metric: 'memory', history: { series } });
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
    });
  });

  describe('average fan speed ribbon', () => {
    it('renders no fan-speed band when there is no fan series', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series } });
      // Both bands render the same accent fill now, so a stray second band
      // shows up as a stray second rect - only the temp band's own rect
      // should be present.
      expect(container.querySelectorAll('rect[fill="var(--accent)"]').length).toBe(1);
    });

    it('renders a fan-speed band averaged across every fan series (RPM), stacked under the temp band', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
        { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW, avg: 1200, max: 1250 }] },
        { id: 'fan:2', kind: 'fan', name: 'Fan 2', points: [{ t: NOW, avg: 1600, max: 1580 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series } });
      // Both bands share the same accent fill - the temp band is pushed
      // first (see MetricHistorySection's ribbons list), so DOM order gives
      // [tempRect, rpmRect].
      const rects = [...container.querySelectorAll('rect[fill="var(--accent)"]')];
      expect(rects.length).toBe(2);
      const [tempRect, rpmRect] = rects;
      // Fan speed sits BELOW (higher y) the temp band, matching stacking order.
      expect(Number(rpmRect.getAttribute('y'))).toBeGreaterThan(Number(tempRect.getAttribute('y')));
      // The averaged value renders as text (1400 RPM), not an icon.
      expect(screen.getByText('1400 RPM')).toBeInTheDocument();
    });

    it('never renders the fan-speed band on memory/network, even with a stray fan series left over from a tab switch', () => {
      // history.series can transiently still carry the previous tab's series
      // for one render right after switching metrics (the new tab's fetch
      // hasn't landed yet) - the fan-speed band must not leak onto a tab that
      // never requested the fan kind.
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW, avg: 1200, max: 1250 }] },
      ];
      const { container } = renderSection({ metric: 'memory', history: { series } });
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
    });
  });

  describe('fps ribbon', () => {
    it('renders no fps band when there is no fps series', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series } });
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
    });

    it('renders an fps band on the cpu tab, stacked under the fan band, with an accessible name', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
        { id: 'fan:1', kind: 'fan', name: 'Fan 1', points: [{ t: NOW, avg: 1200, max: 1250 }] },
        { id: 'fps', kind: 'fps', name: 'FPS', points: [{ t: NOW, avg: 132, max: 140 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series } });
      const rects = [...container.querySelectorAll('rect[fill="var(--accent)"]')];
      expect(rects.length).toBe(3);
      const [tempRect, rpmRect, fpsRect] = rects;
      // FPS sits below both the temp and fan-speed bands (highest y).
      expect(Number(fpsRect.getAttribute('y'))).toBeGreaterThan(Number(rpmRect.getAttribute('y')));
      expect(Number(rpmRect.getAttribute('y'))).toBeGreaterThan(Number(tempRect.getAttribute('y')));
      expect(screen.getByText('132 fps')).toBeInTheDocument();
      expect(container.querySelector('g[role="img"][aria-label="monitoring.history.fps.ariaLabel"]')).toBeInTheDocument();
    });

    it('never renders the fps band on memory/network, even with a stray fps series left over from a tab switch', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'fps', kind: 'fps', name: 'FPS', points: [{ t: NOW, avg: 132, max: 140 }] },
      ];
      const { container } = renderSection({ metric: 'memory', history: { series } });
      expect(container.querySelector('rect[fill="var(--accent)"]')).toBeNull();
    });
  });

  describe('role-aware fan speed sum (cpu/gpu tabs marked in Cooling)', () => {
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'fan:1', kind: 'fan', name: 'Front Fan', points: [{ t: NOW, avg: 1200, max: 1250 }] },
      { id: 'fan:2', kind: 'fan', name: 'Rear Fan', points: [{ t: NOW, avg: 1600, max: 1580 }] },
    ];

    it('sums only the fan(s) marked for the tab\'s role instead of averaging every fan', () => {
      stubGeometry();
      const fanRoles: FanRoleMap = new Map([
        ['fan:1', { role: 'cpu', name: 'Front Fan' }],
        ['fan:2', { role: 'none', name: 'Rear Fan' }],
      ]);
      renderSection({ metric: 'cpu', history: { series }, fanRoles });
      // Sum of just fan:1 (1200), not the two-fan average (1400).
      expect(screen.getByText('1200 RPM')).toBeInTheDocument();
      expect(screen.queryByText('1400 RPM')).toBeNull();
    });

    it('sums every fan marked for the role, not just the first', () => {
      stubGeometry();
      const fanRoles: FanRoleMap = new Map([
        ['fan:1', { role: 'cpu', name: 'Front Fan' }],
        ['fan:2', { role: 'cpu', name: 'Rear Fan' }],
      ]);
      renderSection({ metric: 'cpu', history: { series }, fanRoles });
      expect(screen.getByText('2800 RPM')).toBeInTheDocument();
    });

    it('falls back to the all-fans average when no fan is marked for the tab\'s role', () => {
      stubGeometry();
      const fanRoles: FanRoleMap = new Map([['fan:1', { role: 'gpu', name: 'Front Fan' }]]);
      renderSection({ metric: 'cpu', history: { series }, fanRoles });
      expect(screen.getByText('1400 RPM')).toBeInTheDocument();
    });

    it('falls back to the all-fans average when fanRoles is empty (no config fetched yet)', () => {
      stubGeometry();
      renderSection({ metric: 'cpu', history: { series }, fanRoles: new Map() });
      expect(screen.getByText('1400 RPM')).toBeInTheDocument();
    });

    it('only sums/matches fans marked for the OTHER role\'s tab, not this one - gpu marks do not leak into the cpu sum', () => {
      stubGeometry();
      const fanRoles: FanRoleMap = new Map([
        ['fan:1', { role: 'gpu', name: 'Front Fan' }],
        ['fan:2', { role: 'gpu', name: 'Rear Fan' }],
      ]);
      renderSection({ metric: 'cpu', history: { series }, fanRoles });
      // No cpu-marked fan -> all-fans average, not a gpu-role sum.
      expect(screen.getByText('1400 RPM')).toBeInTheDocument();
    });
  });

  describe('RPM label hover tooltip (rendered via the shared HoverTooltip component, not a native <title>)', () => {
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW, avg: 50, max: 51 }] },
      { id: 'fan:1', kind: 'fan', name: 'Front Fan', points: [{ t: NOW, avg: 1200, max: 1250 }] },
      { id: 'fan:2', kind: 'fan', name: 'Rear Fan', points: [{ t: NOW, avg: 1600, max: 1580 }] },
    ];

    it('renders no native <title> element on the RPM label - HoverTooltip owns it', () => {
      stubGeometry();
      const { container } = renderSection({ metric: 'cpu', history: { series }, fanRoles: new Map() });
      expect(container.querySelector('title')).toBeNull();
    });

    it('lists the marked fan names when at least one fan is marked for the tab\'s role', () => {
      stubGeometry();
      const fanRoles: FanRoleMap = new Map([
        ['fan:1', { role: 'cpu', name: 'Front Fan' }],
        ['fan:2', { role: 'cpu', name: 'Rear Fan' }],
      ]);
      renderSection({ metric: 'cpu', history: { series }, fanRoles });
      // Both fans marked cpu -> summed (2800 RPM), not averaged - see the
      // role-aware fan speed sum tests above.
      fireEvent.focus(screen.getByText('2800 RPM'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.history.rpm.markedFans:Front Fan, Rear Fan');
    });

    it('shows the mark-in-Cooling hint (CPU-specific key) when no fan is marked on the cpu tab', () => {
      stubGeometry();
      renderSection({ metric: 'cpu', history: { series }, fanRoles: new Map() });
      fireEvent.focus(screen.getByText('1400 RPM'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.history.rpm.hintCpu');
    });

    it('shows the mark-in-Cooling hint (GPU-specific key) when no fan is marked on the gpu tab', () => {
      stubGeometry();
      const gpuSeries: UseMetricHistoryResult['series'] = [
        { id: 'gpu:0', kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a', points: [{ t: NOW, avg: 50, max: 51 }] },
        { id: 'fan:1', kind: 'fan', name: 'Front Fan', points: [{ t: NOW, avg: 1200, max: 1250 }] },
      ];
      const gpuComponents: GpuComponent[] = [{ id: 'gpu/0', name: 'RTX 3070', adapterLuid: 'a', sensors: [] }];
      renderSection({
        metric: 'gpu', gpuComponents, preferredGpuId: 'gpu/0', history: { series: gpuSeries }, fanRoles: new Map(),
      });
      fireEvent.focus(screen.getByText('1200 RPM'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.history.rpm.hintGpu');
    });

    it('makes only the RPM band\'s value label keyboard-focusable, not the temp band\'s', () => {
      stubGeometry();
      const seriesWithTemp: UseMetricHistoryResult['series'] = [
        ...series,
        { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW, avg: 70, max: 72 }] },
      ];
      const { container } = renderSection({ metric: 'cpu', history: { series: seriesWithTemp }, fanRoles: new Map() });
      expect(container.querySelectorAll('text[tabindex="0"]').length).toBe(1);
    });
  });

  describe('storage per-app hover breakdown', () => {
    it('formats the per-app hover values as a byte rate (MB/s), not percent or plain bytes', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'disk-read', kind: 'disk', name: 'Disk Read', points: [{ t: NOW, avg: 1_000_000, max: 1_000_000 }] },
        { id: 'disk-write', kind: 'disk', name: 'Disk Write', points: [{ t: NOW, avg: 500_000, max: 500_000 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 4_400_000, max: 5_000_000, points: [{ t: NOW, avg: 4_400_000 }] }];
      const { container } = renderSection({ metric: 'storage', history: { series }, appsWindow: { apps } });
      const svg = container.querySelector('svg')!;
      fireEvent.mouseMove(svg, { clientX: 200 });

      expect(screen.getByText('chrome.exe')).toBeInTheDocument();
      expect(screen.getByText('4.2 MB/s')).toBeInTheDocument();
      expect(screen.queryByText('4400000%')).toBeNull();
    });
  });

  describe('selected-app line overlays the base metric line (item 49)', () => {
    it('shows the base metric line, no app line, when nothing is selected', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 30, max: 40, points: [{ t: NOW - HOUR, avg: 20 }, { t: NOW, avg: 30 }] }];
      const { container } = renderSection({ metric: 'cpu', history: { series }, appsWindow: { apps }, selectedAppName: null });
      expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeNull();
    });

    it('overlays the selected app\'s line on top of the base metric line, which stays visible', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 30, max: 40, points: [{ t: NOW - HOUR, avg: 20 }, { t: NOW, avg: 30 }] }];
      const { container } = renderSection({ metric: 'cpu', history: { series }, appsWindow: { apps }, selectedAppName: 'chrome.exe' });
      // The base metric's own accent-colored line stays, unchanged.
      expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);
      // The app's own line overlays it, in the same bright color as the
      // persistent selection marker.
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeInTheDocument();
      // Only the base line gets a gradient-fill area - the overlay is a bare
      // stroke (buildSelectedAppSeries' own noFill: true and noDots: true) so
      // a second translucent layer doesn't wash out the base graph underneath
      // it and its sparser sampling never renders as isolated dot markers.
      expect(container.querySelectorAll('path[fill^="url(#"]').length).toBe(1);
    });

    it('removes the app overlay line once the selection is cleared, leaving the base metric line untouched throughout', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 30, max: 40, points: [{ t: NOW - HOUR, avg: 20 }, { t: NOW, avg: 30 }] }];
      const { container, rerender } = renderSection({ metric: 'cpu', history: { series }, appsWindow: { apps }, selectedAppName: 'chrome.exe' });
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeInTheDocument();
      expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);

      rerender(
        <MetricHistorySection
          metric="cpu"
          gpuComponents={[]}
          preferredGpuId=""
          history={baseHistory({ series })}
          appsWindow={baseAppsWindow({ apps })}
          fanRoles={new Map()}
          selectedFrameMs={NOW}
          onGraphClick={vi.fn()}
          selectedAppName={null}
          memoryTotalMb={null}
        />,
      );
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeNull();
      expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(1);
    });

    it('follows the active tab\'s metric - no overlay line when the selected app has no series under the new metric', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
      ];
      // No 'chrome.exe' entry in this window's apps - the memory tab's own
      // fetch hasn't matched it (or the app used none this window).
      const { container } = renderSection({ metric: 'memory', history: { series }, appsWindow: { apps: [] }, selectedAppName: 'chrome.exe', memoryTotalMb: 32768 });
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeNull();
    });

    it('rescales the selected app\'s memory MB onto the tab\'s own percent-of-RAM axis', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW - HOUR, avg: 20, max: 21 }, { t: NOW, avg: 25, max: 26 }] },
      ];
      // 8192 MB of 32768 MB total = 25% - lands well inside the same
      // adaptive percent ceiling the main memory line itself uses.
      const apps = [{ name: 'chrome.exe', avg: 8192, max: 8192, points: [{ t: NOW - HOUR, avg: 4096 }, { t: NOW, avg: 8192 }] }];
      const { container } = renderSection({
        metric: 'memory', history: { series }, appsWindow: { apps }, selectedAppName: 'chrome.exe', memoryTotalMb: 32768,
      });
      const appPath = container.querySelector('path[stroke="var(--text)"]');
      expect(appPath).toBeInTheDocument();
      // The axis must not have blown out to accommodate a raw MB value (e.g.
      // "8192%") - it stays on the same small percent ladder as the main line.
      expect(screen.queryByText(/8192%|4096%/)).toBeNull();
    });

    it('omits the memory app overlay line entirely when the total can\'t be derived, rather than misrendering an unscaled MB value', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'memory', kind: 'memory', name: 'Memory', points: [{ t: NOW, avg: 55, max: 56 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 8192, max: 8192, points: [{ t: NOW, avg: 8192 }] }];
      const { container } = renderSection({
        metric: 'memory', history: { series }, appsWindow: { apps }, selectedAppName: 'chrome.exe', memoryTotalMb: null,
      });
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeNull();
    });

    it('passes byte-rate metrics (storage) through unscaled onto the auto-scaling axis, overlaid on both base disk-read/disk-write lines', () => {
      stubGeometry();
      const series: UseMetricHistoryResult['series'] = [
        { id: 'disk-read', kind: 'disk', name: 'Disk Read', points: [{ t: NOW - HOUR, avg: 900_000, max: 1_000_000 }, { t: NOW, avg: 1_000_000, max: 1_000_000 }] },
        { id: 'disk-write', kind: 'disk', name: 'Disk Write', points: [{ t: NOW - HOUR, avg: 400_000, max: 500_000 }, { t: NOW, avg: 500_000, max: 500_000 }] },
      ];
      const apps = [{ name: 'chrome.exe', avg: 4_400_000, max: 4_400_000, points: [{ t: NOW - HOUR, avg: 4_000_000 }, { t: NOW, avg: 4_400_000 }] }];
      const { container } = renderSection({ metric: 'storage', history: { series }, appsWindow: { apps }, selectedAppName: 'chrome.exe' });
      expect(container.querySelector('path[stroke="var(--text)"]')).toBeInTheDocument();
      expect(container.querySelectorAll('path[stroke="var(--accent)"]').length).toBe(2);
    });
  });
});
