import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorList } from './SensorList';

vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', numberFormat: 'dot', timeFormat: '24h', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ language: 'en', t: (key: string, vars?: Record<string, string>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key) }),
}));

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: `Sensor ${id}`, type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, notifyMobile: false, showInHealth: true, repeatMinutes: 0, ...over,
});
const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => (
  { ruleId, state: 'ok', value: 50, since: null, extreme: null, direction: null, acknowledged: false, ...over }
);

describe('SensorList', () => {
  it('shows name, live value and state chip, marks the selection, and reports select changes', () => {
    const onSelect = vi.fn();
    render(
      <SensorList
        rules={[rule('r1'), rule('r2', { enabled: false })]}
        states={[state('r1', { state: 'pending' }), state('r2')]}
        selectedId="r1"
        liveOf={r => (r.id === 'r1' ? 62 : null)}
        onSelect={onSelect}
      />,
    );
    const rows = screen.getAllByTestId('sensor-row');
    expect(rows[0]).toHaveTextContent('monitoring.settings.category.cpuSensor r1 (Temperature)');
    expect(rows[0]).toHaveTextContent('62°C');
    expect(rows[0]).toHaveTextContent('diagnostics.alerts.state.pending');
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
    // A switched-off sensor (alerts off) keeps its name and reading, but shows no status chip and is not dimmed.
    expect(rows[1]).toHaveTextContent('monitoring.settings.category.cpuSensor r2 (Temperature)');
    expect(rows[1]).toHaveTextContent('50°C');
    expect(rows[1].firstElementChild!.className).not.toMatch(/dimmed/);
    expect(rows[1]).not.toHaveTextContent('diagnostics.alerts.state');
    expect(rows[1]).toHaveAttribute('data-selected', 'false');

    fireEvent.click(rows[1].querySelector('button[aria-pressed]')!);
    expect(onSelect).toHaveBeenCalledWith('r2');
    expect(rows[1].querySelector('[role="switch"]')).toBeNull();
  });

  it('shows only a NOT REPORTED chip, with no status or reading text, for a sensor the PC does not report', () => {
    render(
      <SensorList
        rules={[rule('b1', { builtIn: 'ramTemp' }), rule('u1')]}
        states={[state('b1', { state: 'unavailable', value: null }), state('u1', { state: 'unavailable', value: null })]}
        selectedId={null}
        liveOf={() => null}
        onSelect={vi.fn()}
      />,
    );
    for (const row of screen.getAllByTestId('sensor-row')) {
      expect(row).toHaveTextContent('diagnostics.sensors.notReported');
      expect(row.querySelector('[role="switch"]')).toBeNull();
      expect(row).not.toHaveTextContent('diagnostics.alerts.state');
      expect(row).not.toHaveTextContent('diagnostics.alerts.noReading');
    }
  });

  it('shows no reading for a not-reported sensor even when the live list still carries a value', () => {
    render(
      <SensorList
        rules={[rule('f1', { builtIn: 'fanSpeed' })]}
        states={[state('f1', { state: 'unavailable', value: null })]}
        selectedId={null}
        liveOf={() => 0}
        onSelect={vi.fn()}
      />,
    );
    const row = screen.getByTestId('sensor-row');
    expect(row).toHaveTextContent('diagnostics.sensors.notReported');
    expect(row).not.toHaveTextContent('0');
  });

  it('shows no chip for a sensor just switched on with no reading yet, never NOT REPORTED', () => {
    render(
      <SensorList
        rules={[rule('b1', { builtIn: 'cpuTemp' }), rule('u1')]}
        states={[]}
        selectedId={null}
        liveOf={() => null}
        onSelect={vi.fn()}
      />,
    );
    for (const row of screen.getAllByTestId('sensor-row')) {
      expect(row.querySelector('[role="switch"]')).toBeNull();
      expect(row).not.toHaveTextContent('diagnostics.sensors.notReported');
      expect(row).not.toHaveTextContent('diagnostics.alerts.state');
      expect(row).not.toHaveTextContent('diagnostics.alerts.noReading');
    }
  });

  it('uses the shared Card selected treatment for the selected row', () => {
    render(<SensorList rules={[rule('r1')]} states={[state('r1')]} selectedId="r1" liveOf={() => 50} onSelect={vi.fn()} />);
    const card = screen.getByTestId('sensor-row').firstElementChild as HTMLElement;
    expect(card.className).toMatch(/selected/);
  });

  it('shows the reading of a switched-off entry whatever state string the service sends', () => {
    render(
      <SensorList
        rules={[rule('r1', { enabled: false }), rule('r2', { enabled: false })]}
        states={[state('r1', { state: 'off', value: 41 }), state('r2', { state: 'unavailable', value: null })]}
        selectedId={null}
        liveOf={() => null}
        onSelect={vi.fn()}
      />,
    );
    const rows = screen.getAllByTestId('sensor-row');
    expect(rows[0]).toHaveTextContent('41°C');
    expect(rows[0]).not.toHaveTextContent('diagnostics.alerts.state');
    // Not reported shows its chip whether alerts are on or off.
    expect(rows[1]).toHaveTextContent('diagnostics.sensors.notReported');
  });

  it('renders a switched-off built-in with no state and no reading with no chip', () => {
    render(<SensorList rules={[rule('b1', { builtIn: 'ramTemp', enabled: false })]} states={[]} selectedId={null} liveOf={() => null} onSelect={vi.fn()} />);
    const row = screen.getByTestId('sensor-row');
    expect(row.querySelector('[role="switch"]')).toBeNull();
    expect(row).not.toHaveTextContent('diagnostics.sensors.notReported');
  });
});
