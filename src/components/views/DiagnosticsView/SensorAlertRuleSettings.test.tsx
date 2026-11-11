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
  it('hides the picker, the lower knob and Delete for a built-in and offers Restore default', () => {
    renderEditor(builtInRule);
    expect(screen.queryByTestId('sensor-picker')).toBeNull();
    expect(screen.queryByRole('slider', { name: 'diagnostics.alerts.lowKnob' })).toBeNull();
    expect(screen.queryByTestId('sensor-delete')).toBeNull();
    expect(screen.getByTestId('sensor-restore')).toBeInTheDocument();
  });

  it('shows the picker, both knobs and Delete for a user rule, with no on/off toggles for the limits', () => {
    renderEditor(userRule);
    expect(screen.getByTestId('sensor-picker')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'diagnostics.alerts.lowKnob' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'diagnostics.alerts.highKnob' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'diagnostics.alerts.above' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'diagnostics.alerts.below' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'diagnostics.alerts.showInHealth' })).toBeNull();
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

  const typeInto = (container: HTMLElement, knob: 'lowKnob' | 'highKnob', value: string) => {
    fireEvent.click(screen.getByRole('button', { name: `diagnostics.alerts.${knob}` }));
    const field = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value } });
    fireEvent.keyDown(field, { key: 'Enter' });
  };

  it('reads a limit typed at or past the end of the track as no limit', () => {
    const { onSave, container } = renderEditor(userRule);
    typeInto(container, 'highKnob', '150');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: null, high: null, showInHealth: true }));
  });

  it('shows an off side as a hollow knob with its no-limit readout, and a set side with its value', () => {
    renderEditor(userRule);
    expect(screen.getByText('diagnostics.alerts.noLowerLimit')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.alerts.noUpperLimit')).toBeNull();
    expect(screen.getByText('80°C')).toBeInTheDocument();
    expect(document.querySelector('input[data-range-knob="min"]')).toHaveAttribute('data-unset', 'true');
    expect(document.querySelector('input[data-range-knob="max"]')).not.toHaveAttribute('data-unset');
  });

  it('sets a lower limit by typing one, keeps low below high, and clears it by typing the track minimum', () => {
    const { onSave, container } = renderEditor(userRule);
    typeInto(container, 'lowKnob', '20');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: 20, high: 80 }));
    typeInto(container, 'lowKnob', '95');
    const last = onSave.mock.calls.at(-1)![0] as SensorAlertRule;
    expect(last.low).not.toBeNull();
    expect(last.low!).toBeLessThan(last.high ?? Infinity);
  });

  it('clears a limit when its field is emptied', () => {
    const { onSave, container } = renderEditor({ ...userRule, low: 20 });
    typeInto(container, 'lowKnob', '');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: null, high: 80 }));
  });

  it('keeps a limit set on the old track end strictly inside the track', () => {
    renderEditor({ ...userRule, high: 120 });
    const max = document.querySelector('input[data-range-knob="max"]') as HTMLInputElement;
    expect(Number(max.max)).toBeGreaterThan(120);
    expect(max).not.toHaveAttribute('data-unset');
  });

  it('marks a built-in at the state value, the only reading source it has', () => {
    renderEditor(builtInRule, { state: { ruleId: 'builtin-cpu', state: 'ok', value: 61, acknowledged: false } });
    expect(screen.getByText('61°C')).toBeInTheDocument();
  });
});
