import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { SensorsTab } from './SensorsTab';

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  rules: [] as unknown[],
  states: [] as unknown[],
  loaded: true,
  scroll: vi.fn(),
  chart: vi.fn(),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({ rules: h.rules, states: h.states, loaded: h.loaded, error: false, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../search/scroll', () => ({ requestSearchScroll: h.scroll }));
vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUnitPrefs: () => ({ monitoringTempUnit: h.tempUnit, numberFormat: 'dot', timeFormat: '24h', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));
vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({ resolve: (_c: string, id: string) => (id === 'cpu/temp/0' ? { value: 62 } : undefined) }),
}));
vi.mock('../../common/TimeSeriesChart/TimeSeriesChart', () => ({
  TimeSeriesChart: (props: unknown) => { h.chart(props); return <div data-testid="chart" />; },
}));
vi.mock('../../common/TimelineBrush/TimelineBrush', () => ({
  TIMELINE_BRUSH_DEFAULT_HEIGHT: 28,
  TimelineBrush: () => <div data-testid="brush" />,
}));

const history = (over: Partial<UseMetricHistoryResult> = {}): UseMetricHistoryResult => ({
  silhouette: [], series: [{ id: 'r1', kind: 'sensorAlert', name: 'CPU Package', points: [{ t: 1000, avg: 50, max: 52 }] }],
  domain: [0, 2000], stripDomain: [0, 3000], rangeKey: '1h', lastPresetKey: '1h', following: true, dragging: false,
  loading: false, error: false, mocked: false, supported: true, retentionDays: 90, stepSeconds: 1, viewportGeneration: 0,
  setRange: vi.fn(), onBrushChange: vi.fn(), onChartDragSelect: vi.fn(), onChartWheelZoom: vi.fn(() => true),
  detach: vi.fn(), backToLive: vi.fn(), retry: vi.fn(), ...over,
} as UseMetricHistoryResult);

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: `Sensor ${id}`, type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'act',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => (
  { ruleId, state: 'ok', value: 62, since: null, extreme: null, direction: null, acknowledged: false, ...over }
);

const props = (over = {}) => ({ history: history(), focusRuleId: null, onFocused: vi.fn(), onEditRule: vi.fn(), onOpenSettings: vi.fn(), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  h.tempUnit = 'c';
  h.rules = [];
  h.states = [];
  h.loaded = true;
});

describe('SensorsTab', () => {
  it('shows an empty state with a button to the settings when nothing is tracked', () => {
    const p = props();
    render(<SensorsTab {...p} />);
    expect(screen.getByText('diagnostics.sensors.empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.sensors.openSettings' }));
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders a card per rule with its current value, state, and the limit drawn as a chart line', () => {
    h.rules = [rule('r1'), rule('r2', { enabled: false })];
    h.states = [state('r1', { state: 'active', direction: 'above' }), state('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    expect(screen.getAllByText('62°C')).toHaveLength(2);
    expect(screen.getByText('diagnostics.alerts.state.active')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.alerts.state.disabled')).toBeInTheDocument();
    expect(h.chart.mock.calls[0][0]).toMatchObject({ thresholds: [{ value: 80, color: 'var(--bad)' }] });
    expect(screen.getByText('diagnostics.sensors.noHistory')).toBeInTheDocument();
  });

  it('converts the graph values, the limits and the reading to Fahrenheit', () => {
    h.tempUnit = 'f';
    h.rules = [rule('r1')];
    h.states = [state('r1')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByText('143.6°F')).toBeInTheDocument();
    const chart = h.chart.mock.calls[0][0] as { series: Array<{ points: Array<{ avg: number }> }>; thresholds: Array<{ value: number }> };
    expect(chart.series[0].points[0].avg).toBe(122);
    expect(chart.thresholds[0].value).toBe(176);
  });

  it('opens the rule on the Settings tab from its card', () => {
    h.rules = [rule('r1')];
    const p = props();
    render(<SensorsTab {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.sensors.editFor(name=CPU Sensor r1)' }));
    expect(p.onEditRule).toHaveBeenCalledWith('r1');
  });

  it('scrolls to the focused card and reports it handled, dropping an unknown id without scrolling', () => {
    h.rules = [rule('r1')];
    const p = props({ focusRuleId: 'r1' });
    const { unmount } = render(<SensorsTab {...p} />);
    expect(h.scroll).toHaveBeenCalledWith('sensor-card-r1');
    expect(p.onFocused).toHaveBeenCalledTimes(1);
    unmount();
    h.scroll.mockClear();
    const q = props({ focusRuleId: 'gone' });
    render(<SensorsTab {...q} />);
    expect(h.scroll).not.toHaveBeenCalled();
    expect(q.onFocused).toHaveBeenCalledTimes(1);
  });

  it('puts the card anchor where the scroller looks', async () => {
    h.rules = [rule('r1')];
    await act(async () => { render(<SensorsTab {...props()} />); });
    expect(document.querySelector('[data-search-anchor="sensor-card-r1"]')).not.toBeNull();
  });
});
