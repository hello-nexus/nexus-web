import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertsList } from './SensorAlertsList';

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  fetchSensorAlerts: vi.fn(),
  acknowledgeSensorAlert: vi.fn(),
}));

vi.mock('../../../api/diagnosticsAlerts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/diagnosticsAlerts')>()),
  fetchSensorAlerts: h.fetchSensorAlerts,
  acknowledgeSensorAlert: h.acknowledgeSensorAlert,
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useMultiplex: () => ({ connected: true }),
  useTopicCallback: () => {},
}));

vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUnitPrefs: () => ({ monitoringTempUnit: h.tempUnit, numberFormat: 'dot', timeFormat: 'system', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({
    resolve: (_category: string, id: string) => (id === 'cpu/temp/0' ? { value: 62 } : undefined),
  }),
}));

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: `Sensor ${id}`, type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => ({
  ruleId, state: 'ok', value: 62, since: null, extreme: null, direction: null, acknowledged: false, ...over,
});

async function renderList(rules: SensorAlertRule[], states: SensorAlertState[], onOpenRule = vi.fn()) {
  h.fetchSensorAlerts.mockResolvedValue({ ok: true, status: 200, data: { rules, states, history: [] } });
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<SensorAlertsList onOpenRule={onOpenRule} />); });
  return { ...utils, onOpenRule };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tempUnit = 'c';
});

describe('SensorAlertsList', () => {
  it('renders nothing with no rules', async () => {
    const { container } = await renderList([], []);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each rule with its name, live value and state', async () => {
    await renderList(
      [rule('a'), rule('b'), rule('c'), rule('d', { enabled: false })],
      [state('a'), state('b', { state: 'pending' }), state('c', { state: 'unavailable' }), state('d')],
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(r => r.getAttribute('data-state'))).toEqual(['ok', 'pending', 'unavailable', 'disabled']);
    expect(within(rows[0]).getByText('CPU Sensor a')).toBeInTheDocument();
    expect(within(rows[0]).getByText('62°C')).toBeInTheDocument();
    expect(within(rows[0]).getByText('diagnostics.alerts.state.ok')).toBeInTheDocument();
    expect(within(rows[3]).getByText('diagnostics.alerts.state.disabled')).toBeInTheDocument();
  });

  it('colors the badges: ok good, pending warn, active by severity', async () => {
    await renderList(
      [rule('a'), rule('b'), rule('c', { severity: 'act' }), rule('d')],
      [state('a'), state('b', { state: 'pending' }), state('c', { state: 'active', direction: 'above' }), state('d', { state: 'active', direction: 'above' })],
    );
    const color = (label: string) => (screen.getAllByText(label)[0] as HTMLElement).style.getPropertyValue('--badge-color');
    expect(color('diagnostics.alerts.state.ok')).toBe('var(--good)');
    expect(color('diagnostics.alerts.state.pending')).toBe('var(--warn)');
    const active = screen.getAllByText('diagnostics.alerts.state.active') as HTMLElement[];
    expect(active.map(b => b.style.getPropertyValue('--badge-color'))).toEqual(['var(--bad)', 'var(--warn)']);
  });

  it('shows Fahrenheit for a Fahrenheit user', async () => {
    h.tempUnit = 'f';
    await renderList([rule('a')], [state('a')]);
    expect(screen.getByText('143.6°F')).toBeInTheDocument();
  });

  it('opens the rule on click and on Enter or Space', async () => {
    const { onOpenRule } = await renderList([rule('a'), rule('b')], [state('a'), state('b')]);
    const rows = screen.getAllByRole('button', { name: /Sensor/ });
    fireEvent.click(rows[1]);
    expect(onOpenRule).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onOpenRule).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(onOpenRule).toHaveBeenCalledTimes(3);
  });

  it('acknowledges only an active unacknowledged row, without opening it', async () => {
    h.acknowledgeSensorAlert.mockResolvedValue({ ok: true, status: 204, data: null });
    const { onOpenRule } = await renderList(
      [rule('a'), rule('b'), rule('c')],
      [state('a', { state: 'active', direction: 'above' }), state('b', { state: 'active', direction: 'above', acknowledged: true }), state('c')],
    );
    expect(screen.getAllByRole('button', { name: /^diagnostics.alerts.acknowledgeFor/ })).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.acknowledgeFor(name=CPU Sensor a)' })); });
    expect(h.acknowledgeSensorAlert).toHaveBeenCalledWith('a');
    expect(onOpenRule).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /acknowledgeFor/ })).toBeNull();
  });
});
