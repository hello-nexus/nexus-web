import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertsList } from './SensorAlertsList';

const h = vi.hoisted(() => ({
  tempUnit: 'c' as 'c' | 'f',
  fetchSensorAlerts: vi.fn(),
}));

vi.mock('../../../api/diagnosticsAlerts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/diagnosticsAlerts')>()),
  fetchSensorAlerts: h.fetchSensorAlerts,
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
    // A not-reported sensor shows no reading, even while the live list still carries a value for it.
    expect(within(rows[2]).queryByText('62°C')).toBeNull();
    expect(within(rows[2]).getByText('diagnostics.sensors.notReported')).toBeInTheDocument();
    // A switched-off sensor shows its name only.
    expect(within(rows[3]).getByText('CPU Sensor d')).toBeInTheDocument();
    expect(within(rows[3]).queryByText('diagnostics.alerts.state.disabled')).toBeNull();
    expect(within(rows[3]).queryByText('62°C')).toBeNull();
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

  it('has no Acknowledge button, even on an active row', async () => {
    await renderList([rule('a')], [state('a', { state: 'active', direction: 'above' })]);
    expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull();
  });
});
