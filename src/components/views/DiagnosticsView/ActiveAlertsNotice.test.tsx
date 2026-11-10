import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { ActiveAlertsNoticeView } from './ActiveAlertsNotice';

const unit = vi.hoisted(() => ({ temp: 'c' as 'c' | 'f' }));

vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUnitPrefs: () => ({ monitoringTempUnit: unit.temp, numberFormat: 'dot', timeFormat: 'system', monitoringWholeNumbers: false, dateFormat: 'system' }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: `Sensor ${id}`, type: 'Temperature', parentName: 'CPU' },
  low: null, high: 90, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => ({
  ruleId, state: 'active', value: 95, since: null, extreme: 96, direction: 'above', acknowledged: false, ...over,
});

describe('ActiveAlertsNoticeView', () => {
  it('renders nothing without active alerts', () => {
    const { container } = render(<ActiveAlertsNoticeView alerts={[]} onAcknowledge={() => {}} onOpenSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('puts watch in the warning tone and act in the critical tone, critical first', () => {
    const alerts = [
      { rule: rule('w'), state: state('w') },
      { rule: rule('a', { severity: 'act' }), state: state('a') },
    ];
    const { container } = render(<ActiveAlertsNoticeView alerts={alerts} onAcknowledge={() => {}} onOpenSettings={() => {}} />);
    const notices = container.querySelectorAll('[data-tone]');
    expect(Array.from(notices).map(n => n.getAttribute('data-tone'))).toEqual(['critical', 'warning']);
    expect(notices[0]).toHaveTextContent('Sensor a');
    expect(notices[1]).toHaveTextContent('Sensor w');
  });

  it('words a below alert with the lower limit and the reading', () => {
    const alerts = [{ rule: rule('b', { low: 30, high: null }), state: state('b', { direction: 'below', value: 25 }) }];
    render(<ActiveAlertsNoticeView alerts={alerts} onAcknowledge={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByText('diagnostics.alerts.notice.below(name=CPU Sensor b,limit=30°C,value=25°C)')).toBeInTheDocument();
  });

  it('shows temperatures in Fahrenheit for a Fahrenheit user', () => {
    unit.temp = 'f';
    const alerts = [{ rule: rule('w'), state: state('w') }];
    render(<ActiveAlertsNoticeView alerts={alerts} onAcknowledge={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByText('diagnostics.alerts.notice.above(name=CPU Sensor w,limit=194°F,value=203°F)')).toBeInTheDocument();
    unit.temp = 'c';
  });

  it('acknowledges one alert and opens the settings', () => {
    const onAcknowledge = vi.fn();
    const onOpenSettings = vi.fn();
    const alerts = [{ rule: rule('w'), state: state('w') }, { rule: rule('x'), state: state('x') }];
    render(<ActiveAlertsNoticeView alerts={alerts} onAcknowledge={onAcknowledge} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.acknowledgeFor(name=CPU Sensor x)' }));
    expect(onAcknowledge).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.alerts.notice.openSettings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
