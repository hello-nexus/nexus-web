import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';

const h = vi.hoisted(() => ({ tempUnit: 'c' as 'c' | 'f' }));

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
  SensorPicker: () => <div data-testid="sensor-picker" />,
  useSensorLookup: () => ({ resolve: () => undefined }),
}));

const userRule: SensorAlertRule = {
  id: 'r1', enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, builtIn: null,
};
const builtInRule: SensorAlertRule = {
  ...userRule, id: 'builtin-cpu', builtIn: 'cpuTemp',
  sensor: { category: 'builtin', id: 'cpu', name: 'CPU', type: 'Temperature', parentName: '' },
};
const lookup = { resolve: () => undefined } as unknown as Parameters<typeof SensorAlertRuleSettings>[0]['lookup'];

function renderEditor(rule: SensorAlertRule, extra: { state?: SensorAlertState } = {}) {
  const onSave = vi.fn();
  const view = render(
    <SensorAlertRuleSettings rule={rule} lookup={lookup} onPreview={vi.fn()} onSave={onSave} onDelete={vi.fn()} onRestoreDefault={vi.fn()} {...extra} />,
  );
  return { onSave, ...view };
}

beforeEach(() => { h.tempUnit = 'c'; });

describe('SensorAlertRuleSettings', () => {
  it('hides the picker, the side toggles and Delete for a built-in and offers Restore default', () => {
    renderEditor(builtInRule);
    expect(screen.queryByTestId('sensor-picker')).toBeNull();
    expect(screen.queryByText('diagnostics.alerts.below')).toBeNull();
    expect(screen.queryByText('diagnostics.alerts.above')).toBeNull();
    expect(screen.queryByTestId('sensor-delete')).toBeNull();
    expect(screen.getByTestId('sensor-restore')).toBeInTheDocument();
  });

  it('shows the picker, the toggles and Delete for a user rule', () => {
    renderEditor(userRule);
    expect(screen.getByTestId('sensor-picker')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.alerts.above')).toBeInTheDocument();
    expect(screen.getByTestId('sensor-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('sensor-restore')).toBeNull();
  });

  it('bounds a built-in slider to the service limits in Celsius and in Fahrenheit', () => {
    const { unmount } = renderEditor(builtInRule);
    const knob = () => document.querySelector('input[data-range-knob="max"]') as HTMLInputElement;
    expect([knob().min, knob().max]).toEqual(['60', '105']);
    unmount();
    h.tempUnit = 'f';
    renderEditor(builtInRule);
    expect([knob().min, knob().max]).toEqual(['140', '221']);
  });

  it('clamps a typed built-in limit to the service bound instead of showing a value the service refuses', () => {
    const { onSave, container } = renderEditor(builtInRule);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.highKnob' }));
    const field = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ high: 105 }));
  });

  it('lets a user rule keep a typed limit beyond the track', () => {
    const { onSave, container } = renderEditor(userRule);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.highKnob' }));
    const field = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ high: 150 }));
  });

  it('marks a built-in at the state value, the only reading source it has', () => {
    renderEditor(builtInRule, { state: { ruleId: 'builtin-cpu', state: 'ok', value: 61, acknowledged: false } });
    expect(screen.getByText('61°C')).toBeInTheDocument();
  });
});
