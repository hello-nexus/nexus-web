import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsHarness as SensorsTab } from './thermalsTestHarness';

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  rules: [] as unknown[],
  states: [] as unknown[],
  loaded: true,
  chart: vi.fn(),
  atLimit: false,
  add: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  acknowledge: vi.fn(),
  resetBuiltIns: vi.fn(),
  push: vi.fn(),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: h.states, loaded: h.loaded, error: false, loading: false, refresh: vi.fn(), atLimit: h.atLimit,
    add: h.add, save: h.save, remove: h.remove, acknowledge: h.acknowledge, resetBuiltIns: h.resetBuiltIns, preview: vi.fn(),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: h.push }) }));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', async importOriginal => ({
  ...(await importOriginal<object>()),
  sensorsForDevice: (_s: unknown, _n: unknown, _e: unknown, category: string) => (category === 'cpu' ? [{ value: 'cpu/temp/0', type: 'Temperature' }] : []),
}));
vi.mock('./SensorAlertRuleSettings', () => ({
  SensorAlertRuleSettings: ({ rule, onDelete, onRestoreDefault, onToggleEnabled }: { rule: { id: string; enabled: boolean }; onDelete: () => void; onRestoreDefault: () => void; onToggleEnabled: (enabled: boolean) => void }) => (
    <div data-testid="settings-stub">{rule.id}<button type="button" onClick={() => onToggleEnabled(!rule.enabled)}>stub-toggle</button><button type="button" onClick={onDelete}>stub-delete</button><button type="button" onClick={onRestoreDefault}>stub-restore</button></div>
  ),
}));
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

const props = (over = {}) => ({ history: history(), onAlertDismissed: vi.fn(), ...over });

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
  h.resetBuiltIns.mockResolvedValue(true);
});

// Nothing is selected by default, so a test that needs the settings panel or a limit line picks the first row.
const selectFirstRow = () => fireEvent.click(screen.getAllByTestId('sensor-row')[0].querySelector('button[aria-pressed]')!);

describe('ThermalsTab', () => {
  it('shows an empty state whose action adds a sensor, not a link to the settings', async () => {
    render(<SensorsTab {...props()} />);
    expect(screen.getByText('diagnostics.sensors.empty')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByTestId('sensor-add')); });
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.add.mock.calls[0][0]).toMatchObject({ sensor: { category: 'cpu', id: 'cpu/temp/0', type: 'Temperature' }, low: null });
  });

  it('clears a search that would hide a freshly added sensor', async () => {
    // A different sensor, so the picker still has an untracked one to add.
    h.rules = [rule('r1', { sensor: { category: 'cpu', id: 'cpu/temp/9', name: 'Other', type: 'Temperature', parentName: 'CPU' } })];
    render(<SensorsTab {...props()} />);
    const search = screen.getByRole('textbox', { name: 'diagnostics.sensors.search' });
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryAllByTestId('sensor-row')).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getAllByTestId('sensor-add')[0]); });
    expect(search).toHaveValue('');
  });

  it('hides Add sensor and shows the limit note at the rule limit', () => {
    h.rules = Array.from({ length: 50 }, (_, i) => rule(`r${i}`));
    h.atLimit = true;
    render(<SensorsTab {...props()} />);
    expect(screen.queryByTestId('sensor-add')).toBeNull();
    expect(screen.getByText('diagnostics.alerts.limitReached(max=50)')).toBeInTheDocument();
  });

  const otherSensor = { category: 'cpu', id: 'cpu/temp/9', name: 'Other', type: 'Temperature', parentName: 'CPU' };

  it('keeps Add sensor enabled below the limit', () => {
    h.rules = [rule('r1', { sensor: otherSensor })];
    render(<SensorsTab {...props()} />);
    expect(screen.getByTestId('sensor-add')).toBeEnabled();
  });

  it('disables Add sensor while the only sensor the picker lists is already tracked', () => {
    h.rules = [rule('r1')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByTestId('sensor-add')).toBeDisabled();
  });

  it('sends one create for a double click on Add sensor, and opens the new card', async () => {
    h.rules = [rule('r1', { sensor: otherSensor }), rule('new', { sensor: { ...otherSensor, id: 'cpu/temp/8' } })];
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
    selectFirstRow();
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    // The switched-off entry keeps its reading, with no chip.
    expect(screen.getAllByText('62°C')).toHaveLength(2);
    expect(screen.getByText('diagnostics.status.act')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.status.ok')).toBeNull();
    expect(h.chart.mock.calls.at(-1)![0]).toMatchObject({ thresholds: [{ value: 80, color: 'var(--bad)' }] });
  });

  it('says there is no history when the selected sensor has no recorded series', () => {
    h.rules = [rule('r9')];
    render(<SensorsTab {...props()} />);
    expect(screen.getByText('diagnostics.temperature.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('converts the graph values, the limits and the reading to Fahrenheit', () => {
    h.tempUnit = 'f';
    h.rules = [rule('r1')];
    h.states = [state('r1')];
    render(<SensorsTab {...props()} />);
    selectFirstRow();
    expect(screen.getByText('143.6°F')).toBeInTheDocument();
    // The chart plots Celsius and formats every value in the unit preference.
    const chart = h.chart.mock.calls.at(-1)![0] as { series: Array<{ points: Array<{ avg: number }> }>; thresholds: Array<{ value: number }>; valueFormat: (v: number) => string };
    expect(chart.series[0].points[0].avg).toBe(50);
    expect(chart.valueFormat(chart.series[0].points[0].avg)).toBe('122°F');
    expect(chart.valueFormat(chart.thresholds[0].value)).toBe('176°F');
  });

  it('selects nothing by default, and a clicked sensor opens its editor and graph', () => {
    h.rules = [rule('r1'), rule('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.queryByTestId('settings-stub')).toBeNull();
    expect(screen.getByTestId('sensor-detail-empty')).toBeInTheDocument();
    expect(h.chart.mock.calls[0][0]).toMatchObject({ activeSeriesId: null });
    const rows = screen.getAllByTestId('sensor-row');
    expect(rows[0]).toHaveAttribute('data-selected', 'false');
    fireEvent.click(within(rows[0]).getByRole('button', { pressed: false }));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r1');
    fireEvent.click(within(screen.getAllByTestId('sensor-row')[1]).getByRole('button', { pressed: false }));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('r2');
    expect(screen.getAllByTestId('sensor-row')[1]).toHaveAttribute('data-selected', 'true');
  });

  it('plots one chart whose plain wheel scrolls the page and Ctrl/Cmd+wheel zooms', () => {
    h.rules = [rule('r1'), rule('r2')];
    render(<SensorsTab {...props()} />);
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    expect(h.chart.mock.calls[0][0]).toMatchObject({ wheelZoomNeedsModifier: true });
  });

  it('selects nothing after the selected sensor is deleted', () => {
    h.rules = [rule('r1'), rule('r2')];
    const { rerender } = render(<SensorsTab {...props()} />);
    fireEvent.click(within(screen.getAllByTestId('sensor-row')[1]).getByRole('button', { pressed: false }));
    h.rules = [rule('r1')];
    rerender(<SensorsTab {...props()} />);
    expect(screen.queryByTestId('settings-stub')).toBeNull();
    expect(screen.getByTestId('sensor-detail-empty')).toBeInTheDocument();
  });

  it('writes the enabled switch from the settings panel and deletes from the editor', () => {
    h.rules = [rule('r1')];
    render(<SensorsTab {...props()} />);
    selectFirstRow();
    expect(screen.getByTestId('sensor-row').querySelector('[role="switch"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'stub-toggle' }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', enabled: false }), expect.any(Function));
    fireEvent.click(screen.getByRole('button', { name: 'stub-delete' }));
    expect(h.remove).toHaveBeenCalledWith('r1');
  });

  it('toasts when the delete fails', async () => {
    h.rules = [rule('r1')];
    h.remove.mockResolvedValue(false);
    render(<SensorsTab {...props()} />);
    selectFirstRow();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'stub-delete' })); });
    expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.deleteFailed' });
  });

  describe('built-in sensors', () => {
    const builtIn = (id: string, kind: SensorAlertRule['builtIn']) => rule(id, {
      builtIn: kind, sensor: { category: 'builtin', id: id.replace('builtin-', ''), name: 'CPU', type: 'Temperature', parentName: '' },
    });

    it('lists the built-ins first in one list with no group headings and no group-level restore', () => {
      h.rules = [builtIn('builtin-cpu', 'cpuTemp'), builtIn('builtin-gpu', 'gpuTemp'), rule('r1')];
      render(<SensorsTab {...props()} />);
      expect(screen.getAllByTestId('sensor-row').map(r => r.getAttribute('data-rule-id'))).toEqual(['builtin-cpu', 'builtin-gpu', 'r1']);
      expect(screen.queryByText('diagnostics.sensors.group.builtIn')).toBeNull();
      expect(screen.queryByText('diagnostics.sensors.group.custom')).toBeNull();
      expect(screen.queryByTestId('sensor-restore-all')).toBeNull();
      expect(screen.getByTestId('sensor-add')).toBeInTheDocument();
    });

    it('restores one built-in from its editor', () => {
      h.rules = [builtIn('builtin-cpu', 'cpuTemp'), builtIn('builtin-gpu', 'gpuTemp')];
      render(<SensorsTab {...props()} />);
      selectFirstRow();
      fireEvent.click(screen.getByRole('button', { name: 'stub-restore' }));
      expect(h.resetBuiltIns).toHaveBeenCalledWith('builtin-cpu');
    });

    it('toasts when a restore is refused', async () => {
      h.rules = [builtIn('builtin-cpu', 'cpuTemp')];
      h.resetBuiltIns.mockResolvedValue(false);
      render(<SensorsTab {...props()} />);
      selectFirstRow();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'stub-restore' })); });
      expect(h.push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.saveFailed' });
    });
  });

  describe('active alert banner', () => {
    const active = (id: string, over: Partial<SensorAlertState> = {}) => state(id, {
      state: 'active', direction: 'above', value: 10, extreme: 10.1, since: '2026-11-10T21:09:00', ...over,
    });
    // The banner tells a start today from an earlier day, so pin the clock.
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T23:30:00')); });
    afterEach(() => { vi.useRealTimers(); });
    const current = () => ({ type: 'Current', category: 'psu', id: 'psu/c/0', name: 'PSU Output', parentName: 'PSU' });

    it('folds several active alerts into one collapsed banner in the highest tone, expandable to each alert', () => {
      h.rules = [
        rule('r1', { severity: 'watch', high: 9.5, sensor: current() }),
        rule('r2', { severity: 'act', high: 9.5, sensor: current() }),
        rule('r3', { severity: 'act', sensor: current() }),
      ];
      h.states = [active('r1'), active('r2'), state('r3')];
      render(<SensorsTab {...props()} />);
      const banners = screen.getAllByRole('status').filter(el => el.hasAttribute('data-tone'));
      expect(banners).toHaveLength(1);
      expect(banners[0]).toHaveAttribute('data-tone', 'critical');
      expect(banners[0]).toHaveTextContent('diagnostics.sensors.alerts.title(count=2)');
      expect(screen.queryByTestId('sensor-banner-dismiss')).toBeNull();
      const toggle = screen.getByTestId('sensor-banner-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByTestId('sensor-banner-dismiss')).toHaveLength(2);
      fireEvent.click(screen.getAllByTestId('sensor-banner-dismiss')[1]);
      expect(h.acknowledge).toHaveBeenCalledWith('r2');
    });

    it('renders a single alert as the banner itself', () => {
      h.rules = [rule('r1', { severity: 'watch', high: 9.5, sensor: current() })];
      h.states = [active('r1')];
      render(<SensorsTab {...props()} />);
      const banners = screen.getAllByRole('status').filter(el => el.hasAttribute('data-tone'));
      expect(banners).toHaveLength(1);
      expect(banners[0]).toHaveAttribute('data-tone', 'warning');
      expect(banners[0]).toHaveTextContent(/^diagnostics\.alerts\.banner\.above\(name=PSU Output,limit=9\.5 A,time=21:09,peak=10\.1 A\)diagnostics\.alerts\.banner\.detail\(value=10 A\)/);
    });

    it('uses the below text and the lower limit for a low alert', () => {
      h.rules = [rule('r1', { low: 3, high: null, sensor: current() })];
      h.states = [active('r1', { direction: 'below', value: 2, extreme: 1.5 })];
      render(<SensorsTab {...props()} />);
      const banner = screen.getAllByRole('status').find(el => el.hasAttribute('data-tone'))!;
      expect(banner).toHaveTextContent('diagnostics.alerts.banner.below(name=PSU Output,limit=3 A,');
      expect(banner).toHaveTextContent('peak=1.5 A');
    });

    it('keeps a banner for a finished alert until it is dismissed, as a warning even for an act rule', () => {
      h.rules = [rule('r1', { severity: 'act', high: 9.5, sensor: current() })];
      h.states = [state('r1', { endedAt: '2026-11-10T22:00:00', endedPeak: 10.4, endedThreshold: 9.5, endedDirection: 'above' })];
      render(<SensorsTab {...props()} />);
      const banner = screen.getAllByRole('status').find(el => el.hasAttribute('data-tone'))!;
      expect(banner).toHaveAttribute('data-tone', 'warning');
      expect(banner).toHaveTextContent('diagnostics.alerts.banner.ended.above(name=PSU Output,limit=9.5 A,peak=10.4 A)');
      expect(banner).toHaveTextContent('diagnostics.alerts.banner.ended.detail');
      fireEvent.click(screen.getByTestId('sensor-banner-dismiss'));
      expect(h.acknowledge).toHaveBeenCalledWith('r1');
    });

    it('shows no banner for an ok, acknowledged or disabled alert', () => {
      h.rules = [rule('r1'), rule('r2'), rule('r3', { enabled: false })];
      h.states = [state('r1'), active('r2', { acknowledged: true }), active('r3')];
      render(<SensorsTab {...props()} />);
      // The empty settings panel is also a status region, so the banner is found by its tone.
      expect(document.querySelector('[role="status"][data-tone]')).toBeNull();
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

  it('puts the card anchor where the scroller looks', async () => {
    h.rules = [rule('r1')];
    await act(async () => { render(<SensorsTab {...props()} />); });
    expect(document.querySelector('[data-search-anchor="sensor-card-r1"]')).not.toBeNull();
  });
});
