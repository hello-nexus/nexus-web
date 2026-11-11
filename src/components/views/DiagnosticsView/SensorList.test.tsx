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
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});
const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => (
  { ruleId, state: 'ok', value: 50, since: null, extreme: null, direction: null, acknowledged: false, ...over }
);

describe('SensorList', () => {
  it('shows name, live value and state chip, marks the selection, and reports select and enabled changes', () => {
    const onSelect = vi.fn();
    const onToggleEnabled = vi.fn();
    render(
      <SensorList
        rules={[rule('r1'), rule('r2', { enabled: false })]}
        states={[state('r1', { state: 'pending' }), state('r2')]}
        selectedId="r1"
        liveOf={r => (r.id === 'r1' ? 62 : null)}
        onSelect={onSelect}
        onToggleEnabled={onToggleEnabled}
      />,
    );
    const rows = screen.getAllByTestId('sensor-row');
    expect(rows[0]).toHaveTextContent('CPU Sensor r1');
    expect(rows[0]).toHaveTextContent('62°C');
    expect(rows[0]).toHaveTextContent('diagnostics.alerts.state.pending');
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
    // A switched-off sensor keeps its name and switch and hides its value and chip.
    expect(rows[1]).toHaveTextContent('CPU Sensor r2');
    expect(rows[1]).not.toHaveTextContent('50°C');
    expect(rows[1]).not.toHaveTextContent('diagnostics.alerts.state');
    expect(rows[1]).toHaveAttribute('data-selected', 'false');

    fireEvent.click(rows[1].querySelector('button[aria-pressed]')!);
    expect(onSelect).toHaveBeenCalledWith('r2');
    fireEvent.click(rows[1].querySelector('[role="switch"]')!);
    expect(onToggleEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), true);
  });

  it('shows only a NOT REPORTED chip, with no switch, status or reading text, for a sensor the PC does not report', () => {
    render(
      <SensorList
        rules={[rule('b1', { builtIn: 'ramTemp' }), rule('u1')]}
        states={[state('b1', { state: 'unavailable', value: null }), state('u1', { state: 'unavailable', value: null })]}
        selectedId={null}
        liveOf={() => null}
        onSelect={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    for (const row of screen.getAllByTestId('sensor-row')) {
      expect(row).toHaveTextContent('diagnostics.sensors.notReported');
      expect(row.querySelector('[role="switch"]')).toBeNull();
      expect(row).not.toHaveTextContent('diagnostics.alerts.state');
      expect(row).not.toHaveTextContent('diagnostics.alerts.noReading');
    }
  });

  it('uses the shared Card selected treatment for the selected row', () => {
    render(<SensorList rules={[rule('r1')]} states={[state('r1')]} selectedId="r1" liveOf={() => 50} onSelect={vi.fn()} onToggleEnabled={vi.fn()} />);
    const card = screen.getByTestId('sensor-row').firstElementChild as HTMLElement;
    expect(card.className).toMatch(/selected/);
  });

  it('keeps the switch on a switched-off built-in the PC does not report, with no chip', () => {
    render(<SensorList rules={[rule('b1', { builtIn: 'ramTemp', enabled: false })]} states={[]} selectedId={null} liveOf={() => null} onSelect={vi.fn()} onToggleEnabled={vi.fn()} />);
    const row = screen.getByTestId('sensor-row');
    expect(row.querySelector('[role="switch"]')).not.toBeNull();
    expect(row).not.toHaveTextContent('diagnostics.sensors.notReported');
  });
});
