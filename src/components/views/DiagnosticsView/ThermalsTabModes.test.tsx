import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsHarness } from './thermalsTestHarness';
import { INITIAL_THERMALS_SELECTION } from './thermalsHelpers';

const h = vi.hoisted(() => ({
  rules: [] as unknown[],
  coolingChart: vi.fn(),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: [], loaded: true, error: false, loading: false, refresh: vi.fn(), atLimit: false,
    add: vi.fn(), save: vi.fn(), remove: vi.fn(), acknowledge: vi.fn(), resetBuiltIns: vi.fn(), preview: vi.fn(),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', () => ({ sensorsForDevice: () => [] }));
vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({ sensors: [], extras: {}, networkSensors: [], resolve: () => undefined }),
}));
vi.mock('./SensorAlertRuleSettings', () => ({
  SensorAlertRuleSettings: ({ rule, findTracked, onTracked }: {
    rule: { id: string };
    findTracked: (sensor: { category: string; id: string; name: string; type: string; parentName: string }) => { id: string } | undefined;
    onTracked: (existing: { id: string }) => void;
  }) => (
    <div data-testid="settings-stub">
      {rule.id}
      <button
        type="button"
        onClick={() => {
          const existing = findTracked({ category: 'cpu', id: 'u1', name: 'u1', type: 'Temperature', parentName: '' });
          if (existing) onTracked(existing);
        }}
      >
        stub-pick-tracked
      </button>
    </div>
  ),
}));
vi.mock('./GuardTripNotice', () => ({ GuardTripNotice: () => null }));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../common/TimeSeriesChart/TimeSeriesChart', () => ({
  TimeSeriesChart: (props: { series: { id: string }[]; activeSeriesId?: string | null; thresholds?: unknown; onSeriesSelect?: (id: string) => void }) => {
    h.coolingChart(props);
    return (
      <div data-testid="chart" data-active={props.activeSeriesId ?? ''}>
        {props.onSeriesSelect && props.series.map(s => (
          <button key={s.id} type="button" data-testid={`legend-${s.id}`} onClick={() => props.onSeriesSelect?.(s.id)}>{s.id}</button>
        ))}
      </div>
    );
  },
}));
vi.mock('../../common/TimelineBrush/TimelineBrush', () => ({ TIMELINE_BRUSH_DEFAULT_HEIGHT: 28, TimelineBrush: () => null }));

const history = (series: UseMetricHistoryResult['series']): UseMetricHistoryResult => ({
  silhouette: [], series, domain: [0, 2000], stripDomain: [0, 3000], rangeKey: '1h', lastPresetKey: '1h', following: true, dragging: false,
  loading: false, error: false, mocked: false, supported: true, retentionDays: 90, stepSeconds: 1, viewportGeneration: 0,
  setRange: vi.fn(), onBrushChange: vi.fn(), onChartDragSelect: vi.fn(), onChartWheelZoom: vi.fn(() => true),
  detach: vi.fn(), backToLive: vi.fn(), retry: vi.fn(),
} as unknown as UseMetricHistoryResult);

const pt = [{ t: 1000, avg: 50, max: 52 }];
const coolingHistory = history([
  { id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU', points: pt },
  { id: 'gpu-temp:0', kind: 'gpu-temp', name: 'GPU', points: pt },
]);
const sensorHistory = history([{ id: 'u1', kind: 'sensorAlert', name: 'Fan', points: pt }]);

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id, name: id, type: 'Temperature', parentName: '' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: false, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const cpu = rule('builtin:cpu-temp', { builtIn: 'cpuTemp' });
const gpu = rule('builtin:gpu-temp:0', { builtIn: 'gpuTemp' });

const renderTab = (initial = INITIAL_THERMALS_SELECTION) => render(
  <ThermalsHarness
    history={sensorHistory} coolingHistory={coolingHistory} focusRuleId={null}
    onFocused={vi.fn()} onAlertDismissed={vi.fn()} initialSelection={initial}
  />,
);

const rowFor = (id: string) => screen.getAllByTestId('sensor-row').find(r => r.getAttribute('data-rule-id') === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  h.rules = [cpu, gpu, rule('u1'), rule('u2')];
});

describe('Thermals mode toggle', () => {
  it('opens on All thermals with the selected built-in highlighted and its limit drawn', () => {
    renderTab();
    expect(screen.getByTestId('cooling-history')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'cpu-temp');
    expect(h.coolingChart.mock.calls.at(-1)?.[0].thresholds).toEqual([{ value: 80, color: 'var(--warn)' }]);
  });

  it('switches to the Custom sensors chart and back, keeping each mode\'s selection', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('legend-gpu-temp:0'));
    expect(rowFor('builtin:gpu-temp:0')).toHaveAttribute('data-selected', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.mode.custom' }));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u1');
    fireEvent.click(within(rowFor('u2')).getByRole('button'));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u2');

    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.mode.all' }));
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'gpu-temp:0');
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.mode.custom' }));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u2');
  });

  it('hides the Custom option when there are no custom sensors', () => {
    h.rules = [cpu, gpu];
    renderTab();
    expect(screen.queryByRole('radio', { name: 'diagnostics.thermals.mode.custom' })).toBeNull();
    expect(screen.getByTestId('cooling-history')).toBeInTheDocument();
  });

  it('shows All thermals when Custom was stored but the last custom sensor is gone', () => {
    h.rules = [cpu, gpu];
    renderTab({ mode: 'custom', all: null, custom: 'u1' });
    expect(screen.getByTestId('cooling-history')).toBeInTheDocument();
  });
});

describe('Thermals duplicate sensor', () => {
  it('refuses a sensor another entry tracks, names that entry, and selects it on request', () => {
    renderTab();
    fireEvent.click(within(rowFor('u2')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'stub-pick-tracked' }));
    expect(screen.getByText('diagnostics.sensors.tracked.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.sensors.tracked.show' }));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u1');
    expect(screen.queryByText('diagnostics.sensors.tracked.message')).toBeNull();
  });

  it('keeps the entry when the refusal is cancelled', () => {
    renderTab();
    fireEvent.click(within(rowFor('u2')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'stub-pick-tracked' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u2');
  });
});

describe('Thermals selection linking', () => {
  it('selecting a custom entry switches the chart to Custom on that sensor', () => {
    renderTab();
    fireEvent.click(within(rowFor('u2')).getByRole('button'));
    expect(screen.getByTestId('sensor-history')).toHaveAttribute('data-rule-id', 'u2');
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('u2');
  });

  it('selecting a built-in entry while on Custom switches the chart to All thermals', () => {
    renderTab({ ...INITIAL_THERMALS_SELECTION, mode: 'custom' });
    expect(screen.getByTestId('sensor-history')).toBeInTheDocument();
    fireEvent.click(within(rowFor('builtin:gpu-temp:0')).getByRole('button'));
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'gpu-temp:0');
  });

  it('clicking a legend item selects its built-in entry', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('legend-gpu-temp:0'));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('builtin:gpu-temp:0');
  });

  it('lists built-ins first, then the custom entries in one list, with no subheading, and a single add row', () => {
    renderTab();
    const ids = screen.getAllByTestId('sensor-row').map(r => r.getAttribute('data-rule-id'));
    expect(ids).toEqual(['builtin:cpu-temp', 'builtin:gpu-temp:0', 'u1', 'u2']);
    expect(screen.getAllByTestId('sensor-add')).toHaveLength(1);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(within(rowFor('u1')).queryByRole('img', { hidden: true })).toBeNull();
  });
});
