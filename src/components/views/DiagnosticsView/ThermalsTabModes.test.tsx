import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsHarness } from './thermalsTestHarness';
import { INITIAL_THERMALS_SELECTION } from './thermalsHelpers';
import { watchlistFixture } from './watchlistFixture';

const h = vi.hoisted(() => ({
  rules: [] as unknown[],
  atLimit: false,
  coolingChart: vi.fn(),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: [], loaded: true, error: false, loading: false, refresh: vi.fn(), atLimit: h.atLimit,
    add: vi.fn(), save: vi.fn(), remove: vi.fn(), acknowledge: vi.fn(), resetBuiltIns: vi.fn(), preview: vi.fn(),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', async importOriginal => ({ ...(await importOriginal<object>()), sensorsForDevice: () => [] }));
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
const sensorHistory = history([
  { id: 'u1', kind: 'sensorAlert', name: 'Custom temp', points: pt },
  { id: 'l1', kind: 'sensorAlert', name: 'Load', points: pt },
  { id: 'l2', kind: 'sensorAlert', name: 'Load 2', points: pt },
]);

const rule = (id: string, over: Partial<SensorAlertRule> = {}, type = 'Temperature'): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id, name: id, type, parentName: '' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: false, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const cpu = rule('builtin:cpu-temp', { builtIn: 'cpuTemp' });
const gpu = rule('builtin:gpu-temp:0', { builtIn: 'gpuTemp' });
const loads = [rule('l1', {}, 'Load'), rule('l2', {}, 'Load')];

const renderTab = (initial = INITIAL_THERMALS_SELECTION) => render(
  <ThermalsHarness
    history={sensorHistory} coolingHistory={coolingHistory} focusRuleId={null}
    onFocused={vi.fn()} onAlertDismissed={vi.fn()} initialSelection={initial}
  />,
);

const rowFor = (id: string) => screen.getAllByTestId('sensor-row').find(r => r.getAttribute('data-rule-id') === id)!;
const rowButton = (id: string) => within(rowFor(id)).getByRole('button');
const chartSeriesIds = () => (h.coolingChart.mock.calls.at(-1)?.[0].series as { id: string }[]).map(s => s.id);

beforeEach(() => {
  vi.clearAllMocks();
  h.atLimit = false;
  h.rules = [cpu, gpu, rule('u1'), rule('u2'), ...loads];
});

describe('Thermals group buttons', () => {
  it('opens on Thermals with the first built-in highlighted and its limit drawn', () => {
    renderTab();
    expect(screen.getByTestId('thermals-history')).toHaveAttribute('data-group', 'thermals');
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'cpu-temp');
    expect(h.coolingChart.mock.calls.at(-1)?.[0].thresholds).toEqual([{ value: 80, color: 'var(--warn)' }]);
  });

  it('shows a button per group that has an entry, Thermals first, and none when only Thermals exists', () => {
    const { unmount } = renderTab();
    const labels = screen.getAllByRole('radio').map(r => r.textContent);
    expect(labels).toEqual(['diagnostics.tab.thermals', 'diagnostics.thermals.group.loads']);
    unmount();
    h.rules = [cpu, gpu];
    renderTab();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('a group button shows that group and highlights its first entry; its title follows the group', () => {
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.group.loads' }));
    expect(screen.getByTestId('thermals-history')).toHaveAttribute('data-group', 'loads');
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'l1');
    expect(screen.getByText('diagnostics.thermals.history.loads')).toBeInTheDocument();
    expect(chartSeriesIds()).toEqual(['l1', 'l2']);
  });

  it('draws custom temperature entries in the Thermals chart beside the device lines', () => {
    renderTab();
    expect(chartSeriesIds()).toEqual(['cpu-temp', 'gpu-temp:0', 'u1']);
  });

  it('a group button disappears with its last entry', () => {
    h.rules = [cpu, gpu];
    renderTab({ group: 'loads', selectedId: null, auto: true });
    expect(screen.queryByRole('radio', { name: 'diagnostics.thermals.group.loads' })).toBeNull();
    expect(screen.getByTestId('thermals-history')).toHaveAttribute('data-group', 'thermals');
  });
});

describe('Thermals duplicate sensor', () => {
  it('refuses a sensor another entry tracks, names that entry, and selects it on request', () => {
    renderTab();
    fireEvent.click(rowButton('l1'));
    fireEvent.click(screen.getByRole('button', { name: 'stub-pick-tracked' }));
    expect(screen.getByText('diagnostics.sensors.tracked.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.sensors.tracked.show' }));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('u1');
    expect(screen.queryByText('diagnostics.sensors.tracked.message')).toBeNull();
  });

  it('keeps the entry when the refusal is cancelled', () => {
    renderTab();
    fireEvent.click(rowButton('l1'));
    fireEvent.click(screen.getByRole('button', { name: 'stub-pick-tracked' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('l1');
  });
});

describe('Thermals selection linking', () => {
  it('selecting an entry of another unit switches the chart to its group', () => {
    renderTab();
    fireEvent.click(rowButton('l2'));
    expect(screen.getByTestId('thermals-history')).toHaveAttribute('data-group', 'loads');
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'l2');
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('l2');
    fireEvent.click(rowButton('builtin:gpu-temp:0'));
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', 'gpu-temp:0');
  });

  it('clicking a legend item selects its entry, in every group alike', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('legend-gpu-temp:0'));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('builtin:gpu-temp:0');
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.group.loads' }));
    fireEvent.click(screen.getByTestId('legend-l2'));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('l2');
  });

  it('clicking the selected row or legend item again deselects: empty settings, no highlight, no limit lines', () => {
    renderTab();
    fireEvent.click(rowButton('builtin:cpu-temp'));
    expect(screen.getByTestId('sensor-detail-empty')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.thermals.selectHint')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-stub')).toBeNull();
    expect(screen.getByTestId('chart')).toHaveAttribute('data-active', '');
    expect(h.coolingChart.mock.calls.at(-1)?.[0].thresholds).toEqual([]);

    fireEvent.click(screen.getByTestId('legend-gpu-temp:0'));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('builtin:gpu-temp:0');
    fireEvent.click(screen.getByTestId('legend-gpu-temp:0'));
    expect(screen.getByTestId('sensor-detail-empty')).toBeInTheDocument();
  });

  it('every group draws the same legend: one clickable item per line', () => {
    renderTab();
    const thermalsLegend = screen.getAllByTestId(/^legend-/).length;
    expect(thermalsLegend).toBe(3);
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.thermals.group.loads' }));
    expect(screen.getAllByTestId(/^legend-/)).toHaveLength(2);
  });
});

describe('Watchlist sections and search', () => {
  it('sections the list by group in chart order with a heading each, built-ins first', () => {
    renderTab();
    const sections = screen.getAllByTestId('watchlist-group');
    expect(sections.map(sec => sec.getAttribute('data-group'))).toEqual(['thermals', 'loads']);
    expect(within(sections[0]).getByText('diagnostics.tab.thermals')).toBeInTheDocument();
    const ids = screen.getAllByTestId('sensor-row').map(r => r.getAttribute('data-rule-id'));
    expect(ids).toEqual(['builtin:cpu-temp', 'builtin:gpu-temp:0', 'u1', 'u2', 'l1', 'l2']);
    expect(screen.getAllByTestId('sensor-add')).toHaveLength(1);
  });

  it('filters rows by title or subtitle, hides empty groups, and shows an empty result', () => {
    renderTab();
    const search = screen.getByRole('textbox', { name: 'diagnostics.sensors.search' });
    fireEvent.change(search, { target: { value: 'l2' } });
    expect(screen.getAllByTestId('sensor-row').map(r => r.getAttribute('data-rule-id'))).toEqual(['l2']);
    expect(screen.getAllByTestId('watchlist-group')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryAllByTestId('sensor-row')).toHaveLength(0);
    expect(screen.getByText('diagnostics.sensors.noMatches')).toBeInTheDocument();
  });
});

describe('Search and the selected entry', () => {
  it('shows the deselected empty state while search hides the selected entry, and restores it on clear', () => {
    renderTab();
    fireEvent.click(rowButton('u1'));
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('u1');
    const search = screen.getByRole('textbox', { name: 'diagnostics.sensors.search' });
    fireEvent.change(search, { target: { value: 'l2' } });
    expect(screen.queryByTestId('settings-stub')).toBeNull();
    expect(screen.getByTestId('sensor-detail-empty')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByTestId('settings-stub')).toHaveTextContent('u1');
  });
});

describe('Watchlist at the cap', () => {
  it('lays out 50 entries across six groups, searches them, and disables Add at the limit', () => {
    h.rules = watchlistFixture(50);
    h.atLimit = true;
    renderTab();
    expect(screen.getAllByTestId('watchlist-group')).toHaveLength(6);
    expect(screen.getAllByTestId('sensor-row')).toHaveLength(50);
    expect(screen.getByTestId('sensor-add')).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'diagnostics.sensors.search' }), { target: { value: 'sensor 7' } });
    expect(screen.getAllByTestId('sensor-row')).toHaveLength(1);
  });
});
