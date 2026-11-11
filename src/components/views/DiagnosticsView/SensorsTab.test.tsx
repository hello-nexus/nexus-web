import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  atLimit: false,
  add: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  acknowledge: vi.fn(),
  push: vi.fn(),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: h.states, loaded: h.loaded, error: false, loading: false, refresh: vi.fn(), atLimit: h.atLimit,
    add: h.add, save: h.save, remove: h.remove, acknowledge: h.acknowledge, preview: vi.fn(),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: h.push }) }));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', () => ({
  sensorsForDevice: (_s: unknown, _n: unknown, _e: unknown, category: string) => (category === 'cpu' ? [{ value: 'cpu/temp/0', type: 'Temperature' }] : []),
}));
vi.mock('./SensorAlertRuleSettings', () => ({
  SensorAlertRuleSettings: ({ rule, onDelete }: { rule: { id: string }; onDelete: () => void }) => (
    <div data-testid="settings-stub">{rule.id}<button type="button" onClick={onDelete}>stub-delete</button></div>
  ),
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
  useSensorLookup: () => ({
    sensors: [], extras: {}, networkSensors: [],
    resolve: (_c: string, id: string) => (id === 'cpu/temp/0' ? { id, name: 'Sensor', type: 'Temperature', value: 62, parent: { name: 'CPU' } } : undefined),
  }),
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

const props = (over = {}) => ({ history: history(), focusRuleId: null, onFocused: vi.fn(), onAlertDismissed: vi.fn(), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  h.tempUnit = 'c';
  h.rules = [];
  h.states = [];
  h.loaded = true;
  h.atLimit = false;
  h.add.mockResolvedValue({ result: 'created', rule: rule('new') });
  h.acknowledge.mockResolvedValue(true);
  h.remove.mockResolvedValue(true);
});

describe('SensorsTab', () => {
  it('shows an empty state whose action adds a sensor, not a link to the settings', async () => {
    render(<SensorsTab {...props()} />);
    expect(screen.getByText('diagnostics.sensors.empty')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByTestId('sensor-add')); });
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.add.mock.calls[0][0]).toMatchObject({ sensor: { category: 'cpu', id: 'cpu/temp/0', type: 'Temperature' }, low: null });
  });

  it('puts Add sensor at the top of the tab, disabled with the limit text at ten rules', () => {
    h.rules = Array.from({ length: 10 }, (_, i) => rule(`r${i}`));
    h.atLimit = true;
    render(<SensorsTab {...props()} />);
    expect(screen.getByTestId('sensor-add')).toBeDisabled();
    expect(screen.getByText('diagnostics.alerts.limitNote(max=10)')).toBeInTheDocument();
  });

  it('keeps Add sensor enabled below the limit', () => {
    h.rules = [rule('r1')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByTestId('sensor-add')).toBeEnabled();
  });

  it('sends one create for a double click on Add sensor, and opens the new card', async () => {
    h.rules = [rule('r1'), rule('new')];
    let finish!: (v: unknown) => void;
    h.add.mockReturnValue(new Promise(r => { finish = r; }));
    render(<SensorsTab {...props()} />);
    const add = screen.getByTestId('sensor-add');
    fireEvent.click(add);
    fireEvent.click(add);
    expect(h.add).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ result: 'created', rule: rule('new') }); });
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('new');
  });

  it('toasts when the add fails', async () => {
    h.add.mockResolvedValue({ result: 'error', rule: null });
    render(<SensorsTab {...props()} />);
    await act(async () => { fireEvent.click(screen.getByTestId('sensor-add')); });
    expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.addFailed' });
  });

  it('lists a row per rule with its current value, state, and the limit drawn as a chart line', () => {
    h.rules = [rule('r1'), rule('r2', { enabled: false })];
    h.states = [state('r1', { state: 'active', direction: 'above' }), state('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    expect(screen.getAllByText('62°C')).toHaveLength(2);
    expect(screen.getByText('diagnostics.alerts.state.active')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.alerts.state.disabled')).toBeInTheDocument();
    expect(h.chart.mock.calls[0][0]).toMatchObject({ thresholds: [{ value: 80, color: 'var(--bad)' }] });
  });

  it('says there is no history when the selected sensor has no recorded series', () => {
    h.rules = [rule('r9')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByText('diagnostics.sensors.noHistory')).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).toBeNull();
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

  it('shows the editor and graph of the first sensor by default, and the clicked sensor swaps them', () => {
    h.rules = [rule('r1'), rule('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r1');
    expect(screen.getByTestId('sensor-detail')).toHaveAttribute('data-rule-id', 'r1');
    const rows = screen.getAllByTestId('sensor-row');
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
    fireEvent.click(within(rows[1]).getByRole('button', { pressed: false }));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r2');
    expect(screen.getAllByTestId('sensor-row')[1]).toHaveAttribute('data-selected', 'true');
  });

  it('plots one chart whose plain wheel scrolls the page and Ctrl/Cmd+wheel zooms', () => {
    h.rules = [rule('r1'), rule('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    expect(h.chart.mock.calls[0][0]).toMatchObject({ wheelZoomNeedsModifier: true });
  });

  it('falls back to the first sensor after the selected one is deleted', () => {
    h.rules = [rule('r1'), rule('r2')];
    const { rerender } = render(<SensorsTab {...props()} />);
    fireEvent.click(within(screen.getAllByTestId('sensor-row')[1]).getByRole('button', { pressed: false }));
    h.rules = [rule('r1')];
    rerender(<SensorsTab {...props()} />);
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r1');
  });

  it('selects a deep-linked sensor', () => {
    h.rules = [rule('r1'), rule('r2')];
    const p = props({ focusRuleId: 'r2' });
    render(<SensorsTab {...p} />);
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r2');
    expect(p.onFocused).toHaveBeenCalled();
  });

  it('writes the enabled switch and deletes from the editor', () => {
    h.rules = [rule('r1')];
    render(<SensorsTab {...props()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.alerts.enabledFor(name=CPU Sensor r1)' }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', enabled: false }), expect.any(Function));
    fireEvent.click(screen.getByRole('button', { name: 'stub-delete' }));
    expect(h.remove).toHaveBeenCalledWith('r1');
  });

  it('toasts when the delete fails', async () => {
    h.rules = [rule('r1')];
    h.remove.mockResolvedValue(false);
    render(<SensorsTab {...props()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'stub-delete' })); });
    expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.deleteFailed' });
  });

  describe('active alert banner', () => {
    const active = (id: string, over: Partial<SensorAlertState> = {}) => state(id, {
      state: 'active', direction: 'above', value: 10, extreme: 10.1, since: '2026-11-10T21:09:00', ...over,
    });
    // The banner tells a start today from an earlier day, so pin the clock.
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T23:30:00')); });
    afterEach(() => { vi.useRealTimers(); });
    const current = () => ({ type: 'Current', category: 'psu', id: 'psu/c/0', name: 'PSU Output', parentName: 'PSU' });

    it('shows one banner per active alert, warning for watch and critical for act', () => {
      h.rules = [
        rule('r1', { severity: 'watch', high: 9.5, sensor: current() }),
        rule('r2', { severity: 'act', high: 9.5, sensor: current() }),
        rule('r3', { severity: 'act', sensor: current() }),
      ];
      h.states = [active('r1'), active('r2'), state('r3')];
      render(<SensorsTab {...props()} />);
      const banners = screen.getAllByRole('status');
      expect(banners).toHaveLength(2);
      expect(banners[0]).toHaveAttribute('data-tone', 'warning');
      expect(banners[1]).toHaveAttribute('data-tone', 'critical');
      expect(banners[0]).toHaveTextContent(/^diagnostics\.alerts\.banner\.above\(name=PSU Output,limit=9\.5 A,time=21:09,peak=10\.1 A\)diagnostics\.alerts\.banner\.detail\(value=10 A\)/);
    });

    it('uses the below text and the lower limit for a low alert', () => {
      h.rules = [rule('r1', { low: 3, high: null, sensor: current() })];
      h.states = [active('r1', { direction: 'below', value: 2, extreme: 1.5 })];
      render(<SensorsTab {...props()} />);
      expect(screen.getByRole('status')).toHaveTextContent('diagnostics.alerts.banner.below(name=PSU Output,limit=3 A,');
      expect(screen.getByRole('status')).toHaveTextContent('peak=1.5 A');
    });

    it('shows no banner for an ok, acknowledged or disabled alert', () => {
      h.rules = [rule('r1'), rule('r2'), rule('r3', { enabled: false })];
      h.states = [state('r1'), active('r2', { acknowledged: true }), active('r3')];
      render(<SensorsTab {...props()} />);
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('Dismiss acknowledges the rule and refreshes health, and there is no Acknowledge button anywhere', async () => {
      h.rules = [rule('r1')];
      h.states = [active('r1')];
      const p = props();
      render(<SensorsTab {...p} />);
      expect(screen.queryByText(/acknowledge/i)).toBeNull();
      fireEvent.click(screen.getByTestId('sensor-banner-dismiss'));
      await act(async () => {});
      expect(h.acknowledge).toHaveBeenCalledWith('r1');
      expect(p.onAlertDismissed).toHaveBeenCalledTimes(1);
    });

    it('does not refresh health when the service refused the dismissal', async () => {
      h.acknowledge.mockResolvedValue(false);
      h.rules = [rule('r1')];
      h.states = [active('r1')];
      const p = props();
      render(<SensorsTab {...p} />);
      fireEvent.click(screen.getByTestId('sensor-banner-dismiss'));
      await act(async () => {});
      expect(p.onAlertDismissed).not.toHaveBeenCalled();
    });
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

  it('holds the focus scroll until the history has loaded', () => {
    h.rules = [rule('r1')];
    const p = props({ focusRuleId: 'r1', history: history({ loading: true }) });
    const { rerender } = render(<SensorsTab {...p} />);
    expect(h.scroll).not.toHaveBeenCalled();
    expect(p.onFocused).not.toHaveBeenCalled();
    rerender(<SensorsTab {...p} history={history({ loading: false })} />);
    expect(h.scroll).toHaveBeenCalledWith('sensor-card-r1');
    expect(p.onFocused).toHaveBeenCalledTimes(1);
  });

  it('puts the card anchor where the scroller looks', async () => {
    h.rules = [rule('r1')];
    await act(async () => { render(<SensorsTab {...props()} />); });
    expect(document.querySelector('[data-search-anchor="sensor-card-r1"]')).not.toBeNull();
  });
});
