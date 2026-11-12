import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';
import { onPairPhoneRequest } from '../../../app/pairPhoneRequest';

const h = vi.hoisted(() => ({ tempUnit: 'c' as 'c' | 'f', sentry: vi.fn() }));

vi.mock('../../../api/sentry', () => ({ fetchSentry: () => h.sentry() }));

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
  notifyDesktop: true, notifyMobile: false, showInHealth: true, repeatMinutes: 0, builtIn: null,
};
const builtInRule: SensorAlertRule = {
  ...userRule, id: 'builtin-cpu', builtIn: 'cpuTemp',
  sensor: { category: 'builtin', id: 'cpu', name: 'CPU', type: 'Temperature', parentName: '' },
};
const lookup = { resolve: () => undefined } as unknown as Parameters<typeof SensorAlertRuleSettings>[0]['lookup'];

function renderEditor(rule: SensorAlertRule, extra: { state?: SensorAlertState } = {}) {
  const onSave = vi.fn();
  const onToggleEnabled = vi.fn();
  const view = render(
    <SensorAlertRuleSettings rule={rule} lookup={lookup} onPreview={vi.fn()} onSave={onSave} onDelete={vi.fn()} onToggleEnabled={onToggleEnabled} onRestoreDefault={vi.fn()} {...extra} />,
  );
  return { onSave, onToggleEnabled, ...view };
}

beforeEach(() => { h.tempUnit = 'c'; h.sentry.mockReset(); h.sentry.mockResolvedValue({ alertPhones: 2 }); });

describe('SensorAlertRuleSettings', () => {
  it('leads with the enabled switch and reports the new state', () => {
    const { onToggleEnabled } = renderEditor({ ...userRule, enabled: false });
    const sw = screen.getByRole('switch', { name: 'diagnostics.alerts.enabledFor(name=CPU Package)' });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    expect(onToggleEnabled).toHaveBeenCalledWith(true);
    // First row of the panel, ahead of the picker and the limits.
    expect(document.querySelector('[role="switch"]')).toBe(sw);
  });

  it('keeps every setting visible and editable with alerts off, and explains Raise after', () => {
    const { onSave } = renderEditor({ ...userRule, enabled: false });
    expect(screen.getByText('diagnostics.alerts.raiseAfterDescription')).toBeInTheDocument();
    const urgent = screen.getByRole('switch', { name: 'diagnostics.alerts.urgent' });
    expect(urgent).not.toBeDisabled();
    fireEvent.click(urgent);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ severity: 'act', enabled: false }));
    expect(screen.getByRole('switch', { name: 'diagnostics.alerts.notifyDesktop' })).not.toBeDisabled();
  });

  it('maps the Urgent switch to severity act and watch, with no severity chooser', () => {
    const { onSave, unmount } = renderEditor(userRule);
    expect(screen.queryByRole('radio')).toBeNull();
    const urgent = screen.getByRole('switch', { name: 'diagnostics.alerts.urgent' });
    expect(urgent).not.toBeChecked();
    fireEvent.click(urgent);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'act' }));
    unmount();
    const second = renderEditor({ ...userRule, severity: 'act' });
    const on = screen.getByRole('switch', { name: 'diagnostics.alerts.urgent' });
    expect(on).toBeChecked();
    fireEvent.click(on);
    expect(second.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'watch' }));
  });

  it('shows the enabled switch for a built-in too', () => {
    renderEditor(builtInRule);
    expect(screen.getByRole('switch', { name: /diagnostics.alerts.enabledFor/ })).toBeChecked();
  });

  it('hides the picker and Delete for a built-in, shows both knobs, and offers Restore default', () => {
    renderEditor(builtInRule);
    expect(screen.queryByTestId('sensor-picker')).toBeNull();
    expect(screen.getByRole('slider', { name: 'diagnostics.alerts.lowKnob' })).toHaveAttribute('data-unset', 'true');
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

  it('puts the no-limit stops one step past the service range in Celsius and in Fahrenheit', () => {
    const { unmount } = renderEditor(builtInRule);
    const knob = () => document.querySelector('input[data-range-knob="max"]') as HTMLInputElement;
    expect([knob().min, knob().max]).toEqual(['19', '101']);
    unmount();
    h.tempUnit = 'f';
    renderEditor(builtInRule);
    expect([knob().min, knob().max]).toEqual(['67', '213']);
  });

  const typeInto = (container: HTMLElement, knob: 'lowKnob' | 'highKnob', value: string) => {
    fireEvent.click(screen.getByRole('button', { name: `diagnostics.alerts.${knob}` }));
    const field = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value } });
    fireEvent.keyDown(field, { key: 'Enter' });
  };

  it('makes the range maximum settable and the step past it no limit', () => {
    const { onSave, container } = renderEditor(builtInRule);
    typeInto(container, 'highKnob', '100');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ high: 100 }));
    typeInto(container, 'highKnob', '101');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ high: null }));
    typeInto(container, 'lowKnob', '20');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: 20 }));
  });

  it('reads the step below the range minimum as no lower limit', () => {
    const { onSave, container } = renderEditor({ ...builtInRule, low: 30 });
    typeInto(container, 'lowKnob', '19');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: null }));
  });

  it('lets a built-in take a lower limit and clear its upper limit like a custom rule', () => {
    const { onSave, container } = renderEditor(builtInRule);
    typeInto(container, 'lowKnob', '70');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: 70, high: 80 }));
    typeInto(container, 'highKnob', '150');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ high: null }));
  });

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
    typeInto(container, 'lowKnob', '30');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ low: 30, high: 80 }));
    typeInto(container, 'lowKnob', '95');
    const last = onSave.mock.calls.at(-1)![0] as SensorAlertRule;
    expect(last.low).not.toBeNull();
    expect(last.low!).toBeLessThan(last.high ?? Infinity);
  });

  it('clears a limit when its field is emptied', () => {
    const { onSave, container } = renderEditor({ ...userRule, low: 30 });
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

  describe('mobile notifications', () => {
    it('sits directly under Desktop notification and saves notifyMobile', () => {
      const { onSave } = renderEditor(userRule);
      const switches = screen.getAllByRole('switch').map(el => el.getAttribute('aria-label') ?? el.textContent);
      const desktop = screen.getByRole('switch', { name: /diagnostics.alerts.notifyDesktop/ });
      const mobile = screen.getByRole('switch', { name: /diagnostics.alerts.notifyMobile/ });
      expect(switches.length).toBeGreaterThan(2);
      const all = screen.getAllByRole('switch');
      expect(all.indexOf(mobile)).toBe(all.indexOf(desktop) + 1);
      expect(mobile).not.toBeChecked();
      fireEvent.click(mobile);
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notifyMobile: true }));
    });

    it('shows the paired phone count', async () => {
      renderEditor(userRule);
      expect(await screen.findByText('diagnostics.alerts.phonesPaired.other(count=2)')).toBeInTheDocument();
    });

    it('with no phones paired, offers Pair remote and opens the flow', async () => {
      h.sentry.mockResolvedValue({ alertPhones: 0 });
      const opened = vi.fn();
      const off = onPairPhoneRequest(opened);
      renderEditor(userRule);
      expect(await screen.findByText(/diagnostics.alerts.noPhonesPaired/)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('pair-remote-link'));
      expect(screen.getByTestId('pair-remote-link')).toHaveTextContent('phonePair.title');
      expect(opened).toHaveBeenCalledTimes(1);
      off();
    });

    it('shows no phone text when the status read fails', async () => {
      h.sentry.mockRejectedValue(new Error('offline'));
      renderEditor(userRule);
      await Promise.resolve();
      expect(screen.queryByText(/diagnostics.alerts.noPhonesPaired/)).toBeNull();
      expect(screen.queryByTestId('pair-remote-link')).toBeNull();
      expect(screen.queryByText(/phonesPaired/)).toBeNull();
    });
  });
});
