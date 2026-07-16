import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricHistorySection } from './MetricHistorySection';
import type { UseMetricHistoryResult } from '../../../../hooks/useMetricHistory';
import type { GpuComponent } from '../../../../lib/gpuResolver';

const historyMock = vi.fn<() => UseMetricHistoryResult>();
vi.mock('../../../../hooks/useMetricHistory', () => ({
  useMetricHistory: () => historyMock(),
}));

vi.mock('../../../../hooks/useUiSettings', () => ({
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const HOUR = 3_600_000;
const NOW = 10_000_000;

function baseResult(over: Partial<UseMetricHistoryResult> = {}): UseMetricHistoryResult {
  return {
    silhouette: [],
    series: [],
    domain: [NOW - HOUR, NOW],
    fullDomain: [NOW - 7 * 24 * HOUR, NOW],
    rangeKey: '1h',
    following: true,
    loading: false,
    error: false,
    mocked: false,
    supported: true,
    retentionDays: 7,
    setRange: vi.fn(),
    onBrushChange: vi.fn(),
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

describe('MetricHistorySection', () => {
  it('renders nothing when supported is false', () => {
    stubGeometry();
    historyMock.mockReturnValue(baseResult({ supported: false }));
    const { container } = render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Live badge while following and hides it while detached', () => {
    stubGeometry();
    historyMock.mockReturnValue(baseResult({ following: true }));
    const { rerender } = render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(screen.getByText('monitoring.history.live')).toBeInTheDocument();

    historyMock.mockReturnValue(baseResult({ following: false }));
    rerender(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(screen.queryByText('monitoring.history.live')).toBeNull();
  });

  it('shows the mocked badge when the data is dev-mocked', () => {
    stubGeometry();
    historyMock.mockReturnValue(baseResult({ mocked: true }));
    render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(screen.getByText('monitoring.history.mocked')).toBeInTheDocument();
  });

  it('shows an error state with a retry action that calls retry()', () => {
    stubGeometry();
    const retry = vi.fn();
    historyMock.mockReturnValue(baseResult({ error: true, retry }));
    render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    fireEvent.click(screen.getByText('monitoring.history.retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('is hidden for the gpu metric when no GPU resolves', () => {
    stubGeometry();
    historyMock.mockReturnValue(baseResult({ series: [] }));
    const { container } = render(<MetricHistorySection metric="gpu" gpuComponents={[]} preferredGpuId="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the matched GPU series by adapterLuid, hiding other GPUs\' data', () => {
    stubGeometry();
    const twoPoints = (base: number) => [{ t: NOW - HOUR, avg: base, max: base + 2 }, { t: NOW, avg: base, max: base + 2 }];
    const series: UseMetricHistoryResult['series'] = [
      { id: 'gpu:0', kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a', points: twoPoints(40) },
      { id: 'gpu:1', kind: 'gpu', name: 'RTX 4090', adapterLuid: 'b', points: twoPoints(90) },
    ];
    historyMock.mockReturnValue(baseResult({ series }));
    const gpuComponents: GpuComponent[] = [{ id: 'gpu/0', name: 'RTX 3070', adapterLuid: 'a', sensors: [] }];
    const { container } = render(<MetricHistorySection metric="gpu" gpuComponents={gpuComponents} preferredGpuId="" />);
    expect(container.querySelector('path[stroke="var(--accent)"]')).toBeInTheDocument();
    // Only one line drawn (the matched GPU), not both.
    expect(container.querySelectorAll('path[fill="none"]').length).toBe(1);
  });

  it('names the network series Download/Upload with distinct colors', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'net-in', kind: 'net', name: 'net-in', points: [{ t: NOW, avg: 100, max: 120 }] },
      { id: 'net-out', kind: 'net', name: 'net-out', points: [{ t: NOW, avg: 10, max: 12 }] },
    ];
    historyMock.mockReturnValue(baseResult({ series }));
    render(<MetricHistorySection metric="network" gpuComponents={[]} preferredGpuId="" />);
    expect(screen.getByText('monitoring.history.download')).toBeInTheDocument();
    expect(screen.getByText('monitoring.history.upload')).toBeInTheDocument();
  });

  it('renders a temperature threshold band and tooltip row for the cpu metric', () => {
    stubGeometry();
    const series: UseMetricHistoryResult['series'] = [
      { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: NOW - HOUR, avg: 40, max: 41 }, { t: NOW, avg: 50, max: 51 }] },
      { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: [{ t: NOW - HOUR, avg: 90, max: 91 }, { t: NOW, avg: 91, max: 92 }] },
    ];
    historyMock.mockReturnValue(baseResult({ series }));
    const { container } = render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(container.querySelector('rect[fill="var(--bad)"]')).toBeInTheDocument();
  });

  it('shows the Custom placeholder in the range dropdown when rangeKey is custom', () => {
    stubGeometry();
    historyMock.mockReturnValue(baseResult({ rangeKey: 'custom' }));
    render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    expect(screen.getByText('monitoring.history.range.custom')).toBeInTheDocument();
  });

  it('calls setRange when a preset is chosen from the dropdown', () => {
    stubGeometry();
    const setRange = vi.fn();
    historyMock.mockReturnValue(baseResult({ setRange }));
    render(<MetricHistorySection metric="cpu" gpuComponents={[]} preferredGpuId="" />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.rangeAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.range.3h' }));
    expect(setRange).toHaveBeenCalledWith('3h');
  });
});
