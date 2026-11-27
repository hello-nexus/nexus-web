import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsTab } from './ThermalsTab';

const h = vi.hoisted(() => ({
  rules: [] as unknown[], channels: [] as unknown[], coolingOn: true, update: vi.fn(), topic: null as null | (() => void),
  setControlled: vi.fn(), preview: vi.fn(),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({ useMultiplex: () => ({ connected: true }), useTopicCallback: (_t: string, _e: boolean, cb: () => void) => { h.topic = cb; } }));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: [], loaded: true, error: false, loading: false, refresh: vi.fn(), atLimit: false,
    add: vi.fn(), save: vi.fn(), remove: vi.fn(), acknowledge: vi.fn(), resetBuiltIns: vi.fn(), preview: h.preview,
  }),
}));
vi.mock('../../../api/cooling', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/cooling')>()),
  fetchFanChannels: () => Promise.resolve({ channels: h.channels }),
  setFanControlledWithStatus: (id: string, controlled: boolean) => h.setControlled(id, controlled),
}));
vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUiSettingsUpdateSafe: () => h.update,
  useFeatureFlags: () => ({ lighting: true, cooling: h.coolingOn, monitoring: true, diagnostics: true }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', numberFormat: 'dot', timeFormat: '24h', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', async importOriginal => ({ ...(await importOriginal<object>()), sensorsForDevice: () => [] }));
vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  SensorPicker: () => null,
  useSensorLookup: () => ({ sensors: [], extras: {}, networkSensors: [], resolve: () => undefined }),
}));
vi.mock('./GuardTripNotice', () => ({ GuardTripNotice: () => null }));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ language: 'en', t: (key: string, vars?: Record<string, string>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key) }),
}));
vi.mock('../../common/TimeSeriesChart/TimeSeriesChart', () => ({
  TimeSeriesChart: (props: { series: { id: string }[]; ribbons?: { valueLabel?: string }[] }) => (
    <div data-testid="chart" data-ribbon={props.ribbons?.[0]?.valueLabel ?? ''}>{props.series.map(s => <span key={s.id} data-testid="legend">{s.id}</span>)}</div>
  ),
}));
vi.mock('../../common/TimelineBrush/TimelineBrush', () => ({ TIMELINE_BRUSH_DEFAULT_HEIGHT: 28, TimelineBrush: () => null }));

const pt = [{ t: 1000, avg: 900, max: 910 }];
const history = (ids: string[]): UseMetricHistoryResult => ({
  silhouette: [], series: ids.map(id => ({ id, kind: 'sensorAlert', name: id, points: pt })), domain: [0, 2000], stripDomain: [0, 3000],
  rangeKey: '1h', lastPresetKey: '1h', following: true, dragging: false, loading: false, error: false, mocked: false, supported: true,
  retentionDays: 90, stepSeconds: 1, viewportGeneration: 0,
  setRange: vi.fn(), onBrushChange: vi.fn(), onChartDragSelect: vi.fn(), onChartWheelZoom: vi.fn(() => true), detach: vi.fn(), backToLive: vi.fn(), retry: vi.fn(),
} as unknown as UseMetricHistoryResult);

/** A fan entry as the service sends it: with a control channel, `enabled` is that channel's Nexus Control. */
const fanRule = (seriesId: string, controlChannel: string | null = null, enabled = true): SensorAlertRule => ({
  id: `builtin:fan:${seriesId}`, enabled, builtIn: 'fanSpeed',
  source: { kind: 'channel', sensor: null, sensors: [], hardwareName: 'Board', controlChannel },
  sensor: { category: 'builtin', id: `fan:${seriesId}`, name: seriesId, type: 'Fan', parentName: '' },
  low: null, high: null, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, notifyMobile: false, showInHealth: true, repeatMinutes: 0,
});

function renderTab(onOpenCoolingFan = vi.fn(), group: 'fans' | 'thermals' = 'fans', selectedId = 'builtin:fan:s_off') {
  const sensorHistory = history(['builtin:fan:s_off', 'builtin:fan:s_on', 'builtin:fan:s_other']);
  render(
    <ThermalsTab
      coolingHistory={{ ...sensorHistory, series: ['fan:s_off', 'fan:s_on'].map((id, i) => ({ id, kind: 'fan', name: id, points: [{ t: 1000, avg: i * 900, max: i * 900 }] })) as UseMetricHistoryResult['series'] }} sensorHistory={sensorHistory} episodes={[]} serviceOnline
      onGuardTripDismissed={() => {}} selection={{ group, selectedId: group === 'fans' ? selectedId : null }} onSelectionChange={() => {}}
      onAlertDismissed={() => {}} onOpenCoolingFan={onOpenCoolingFan}
    />,
  );
  return onOpenCoolingFan;
}

beforeEach(() => {
  h.coolingOn = true;
  h.update.mockClear();
  h.preview.mockClear();
  h.setControlled.mockReset();
  h.rules = [fanRule('s_off', 'hw/off', false), fanRule('s_on', 'hw/on')];
  h.channels = [
    { id: 'hw/off', seriesId: 's_off', name: 'Off', controlled: false, rpm: 0, dutyPercent: 0, mode: 'Auto' },
    { id: 'hw/on', seriesId: 's_on', name: 'On', rpm: 900, dutyPercent: 40, mode: 'Auto' },
  ];
});

describe('ThermalsTab fans follow Cooling', () => {
  it('marks a control-off fan, drops it from the chart, and adds a Cooling row to its settings', async () => {
    const onOpen = renderTab();
    await waitFor(() => expect(screen.getAllByTestId('sensor-row')[0]).toHaveAttribute('data-state', 'notControlled'));
    expect(screen.getAllByTestId('sensor-row')[1]).not.toHaveAttribute('data-state', 'notControlled');
    expect(screen.getAllByTestId('legend').map(el => el.textContent)).toEqual(['builtin:fan:s_on']);
    expect(screen.getByRole('switch', { name: /enabledFor/ })).toBeInTheDocument();
    expect(screen.getByText('diagnostics.alerts.fanPaused')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sensor-open-cooling'));
    expect(onOpen).toHaveBeenCalledWith('hw/off');
    expect(h.update).toHaveBeenCalledWith({ showUncontrolledCoolingDevices: true });
  });

  it('keeps today behavior with the Cooling feature off', async () => {
    h.coolingOn = false;
    renderTab();
    expect(screen.getAllByTestId('legend')).toHaveLength(2);
    expect(screen.getAllByTestId('sensor-row')[0]).not.toHaveAttribute('data-state', 'notControlled');
    expect(screen.queryByTestId('sensor-open-cooling')).toBeNull();
    expect(screen.getByRole('switch', { name: /enabledFor/ })).toBeInTheDocument();
  });

  it('shows a plain Controlled status, no pause line and no reveal, for a fan Cooling still tracks', async () => {
    const onOpen = renderTab(vi.fn(), 'fans', 'builtin:fan:s_on');
    await waitFor(() => expect(screen.getByText('diagnostics.sensors.fan.controlled')).toBeInTheDocument());
    expect(screen.queryByText('diagnostics.alerts.fanPaused')).toBeNull();
    fireEvent.click(screen.getByTestId('sensor-open-cooling'));
    expect(onOpen).toHaveBeenCalledWith('hw/on');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('shows no Cooling row for a fan that is not a Cooling channel', async () => {
    h.rules = [fanRule('s_off', 'hw/off', false), fanRule('s_on', 'hw/on'), fanRule('s_other')];
    renderTab(vi.fn(), 'fans', 'builtin:fan:s_other');
    await waitFor(() => expect(screen.getAllByTestId('sensor-row')[0]).toHaveAttribute('data-state', 'notControlled'));
    expect(screen.getByRole('switch', { name: /enabledFor/ })).toBeInTheDocument();
    expect(screen.queryByTestId('sensor-open-cooling')).toBeNull();
  });

  it('drops excluded fans from the average fan speed strip', async () => {
    renderTab(vi.fn(), 'thermals');
    await waitFor(() => expect(screen.getAllByTestId('sensor-row')[0]).toHaveAttribute('data-state', 'notControlled'));
    expect(screen.getByTestId('chart')).toHaveAttribute('data-ribbon', '900 RPM');
  });

  it('agrees across switch, status row, list chip and chart right after a toggle, without waiting for a poll', async () => {
    h.setControlled.mockImplementation((id: string, controlled: boolean) => {
      h.channels = h.channels.map(c => ((c as { id: string }).id === id ? { ...(c as object), controlled } : c));
      h.rules = h.rules.map(r => ((r as SensorAlertRule).source?.controlChannel === id ? { ...(r as SensorAlertRule), enabled: controlled } : r));
      h.topic?.();
      return Promise.resolve({ ok: true, status: 200 });
    });
    renderTab(vi.fn(), 'fans', 'builtin:fan:s_on');
    await waitFor(() => expect(screen.getByText('diagnostics.sensors.fan.controlled')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('switch', { name: /enabledFor/ }));
    expect(h.setControlled).toHaveBeenCalledWith('hw/on', false);
    await waitFor(() => expect(screen.getByRole('switch', { name: /enabledFor/ })).not.toBeChecked());
    await waitFor(() => expect(screen.getAllByTestId('sensor-row')[1]).toHaveAttribute('data-state', 'notControlled'));
    expect(screen.getAllByText('cooling.fan.notControlled').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByTestId('legend')).toHaveLength(0);
  });

  it('keeps a pump out of the exclusion even with control off', async () => {
    h.channels = [{ id: 'hw/off', seriesId: 's_off', name: 'Pump', kind: 'Pump', controlled: false, rpm: 0, dutyPercent: 0, mode: 'Auto' }, h.channels[1]];
    h.rules = [fanRule('s_off'), fanRule('s_on', 'hw/on')];
    renderTab();
    await waitFor(() => expect(screen.getByText('diagnostics.sensors.fan.controlled')).toBeInTheDocument());
    expect(screen.getAllByTestId('sensor-row')[0]).not.toHaveAttribute('data-state', 'notControlled');
  });
});
