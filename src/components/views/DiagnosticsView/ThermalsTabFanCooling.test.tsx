import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsTab } from './ThermalsTab';

const h = vi.hoisted(() => ({ rules: [] as unknown[], channels: [] as unknown[], coolingOn: true }));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: h.rules, states: [], loaded: true, error: false, loading: false, refresh: vi.fn(), atLimit: false,
    add: vi.fn(), save: vi.fn(), remove: vi.fn(), acknowledge: vi.fn(), resetBuiltIns: vi.fn(), preview: vi.fn(),
  }),
}));
vi.mock('../../../api/cooling', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/cooling')>()),
  fetchFanChannels: () => Promise.resolve({ channels: h.channels }),
}));
vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
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
  TimeSeriesChart: (props: { series: { id: string }[] }) => (
    <div data-testid="chart">{props.series.map(s => <span key={s.id} data-testid="legend">{s.id}</span>)}</div>
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

const fanRule = (seriesId: string): SensorAlertRule => ({
  id: `builtin:fan:${seriesId}`, enabled: true, builtIn: 'fanSpeed',
  sensor: { category: 'builtin', id: `fan:${seriesId}`, name: seriesId, type: 'Fan', parentName: '' },
  low: null, high: null, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, notifyMobile: false, showInHealth: true, repeatMinutes: 0,
});

function renderTab(onOpenCoolingFan = vi.fn()) {
  const sensorHistory = history(['builtin:fan:s_off', 'builtin:fan:s_on']);
  render(
    <ThermalsTab
      coolingHistory={{ ...sensorHistory, series: [] }} sensorHistory={sensorHistory} episodes={[]} serviceOnline
      onGuardTripDismissed={() => {}} selection={{ group: 'fans', selectedId: 'builtin:fan:s_off' }} onSelectionChange={() => {}}
      onAlertDismissed={() => {}} onOpenCoolingFan={onOpenCoolingFan}
    />,
  );
  return onOpenCoolingFan;
}

beforeEach(() => {
  h.coolingOn = true;
  h.rules = [fanRule('s_off'), fanRule('s_on')];
  h.channels = [
    { id: 'hw/off', seriesId: 's_off', name: 'Off', controlled: false, rpm: 0, dutyPercent: 0, mode: 'Auto' },
    { id: 'hw/on', seriesId: 's_on', name: 'On', rpm: 900, dutyPercent: 40, mode: 'Auto' },
  ];
});

describe('ThermalsTab fans follow Cooling', () => {
  it('marks a control-off fan, drops it from the chart, and links its settings to Cooling', async () => {
    const onOpen = renderTab();
    await waitFor(() => expect(screen.getAllByTestId('sensor-row')[0]).toHaveAttribute('data-state', 'notControlled'));
    expect(screen.getAllByTestId('sensor-row')[1]).not.toHaveAttribute('data-state', 'notControlled');
    expect(screen.getAllByTestId('legend').map(el => el.textContent)).toEqual(['builtin:fan:s_on']);
    expect(screen.queryByRole('switch', { name: /enabledFor/ })).toBeNull();
    fireEvent.click(screen.getByTestId('fan-manage-cooling'));
    expect(onOpen).toHaveBeenCalledWith('hw/off');
  });

  it('keeps today behavior with the Cooling feature off', async () => {
    h.coolingOn = false;
    renderTab();
    expect(screen.getAllByTestId('legend')).toHaveLength(2);
    expect(screen.getAllByTestId('sensor-row')[0]).not.toHaveAttribute('data-state', 'notControlled');
    expect(screen.queryByTestId('fan-manage-cooling')).toBeNull();
    expect(screen.getByRole('switch', { name: /enabledFor/ })).toBeInTheDocument();
  });
});
