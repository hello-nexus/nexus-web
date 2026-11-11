import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsTab } from './SettingsTab';

const update = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return {
    ...actual,
    useUiSettings: () => ({ settings: mockSettings, update, reload: vi.fn() }),
  };
});

// The alerts section has its own suite and reads sensors and the service.
vi.mock('./SensorAlertsSection', () => ({ SensorAlertsSection: ({ focusRuleId }: { focusRuleId?: string | null }) => <div data-testid="sensor-alerts" data-focus={focusRuleId ?? ''} /> }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    diagnosticsCpuTempC: 90,
    diagnosticsGpuTempC: 85,
    diagnosticsStorageTempC: 70,
    diagnosticsRamTempC: 60,
    diagnosticsWarningLingerMinutes: 0,
    diagnosticsNotificationsEnabled: false,
    diagnosticsNotifyHighTemp: false,
    diagnosticsNotifyStorageHealth: false,
    diagnosticsNotifyCooling: false,
    diagnosticsNotifyMemoryTest: false,
    diagnosticsNotifySystemDevices: false,
    diagnosticsNotifyGpuThrottle: false,
    diagnosticsNotificationCooldownMinutes: 60,
    diagnosticsComponentCpu: true,
    diagnosticsComponentGpu: true,
    diagnosticsComponentStorage: true,
    diagnosticsComponentRam: true,
    diagnosticsComponentCooling: true,
    diagnosticsComponentSystem: true,
    ...overrides,
  };
}

const maxTempSliders = () => screen.getAllByRole('slider', { name: /diagnostics\.settings\.components\.maxTemp/ });

describe('SettingsTab', () => {
  it('orders the sections components, linger, notifications, sensor alerts, then the danger zone with the reset', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    const order = [
      screen.getByText('diagnostics.settings.components.title'),
      screen.getByText('diagnostics.settings.linger.title'),
      screen.getByText('diagnostics.settings.notifications.title'),
      screen.getByTestId('sensor-alerts'),
      screen.getByText('settings.dangerZone'),
      screen.getByText('diagnostics.settings.reset.label'),
    ];
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('passes the alert to focus on to the sensor alerts section', () => {
    mockSettings = baseSettings();
    render(<SettingsTab focusAlertId="r7" />);
    expect(screen.getByTestId('sensor-alerts')).toHaveAttribute('data-focus', 'r7');
  });

  it('renders the section titles and per-component sliders', () => {
    mockSettings = baseSettings();
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.queryByText('diagnostics.settings.thresholds.title')).toBeNull();
    expect(screen.getByText('diagnostics.settings.linger.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.notifications.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.components.title')).toBeInTheDocument();
    expect(screen.getByTestId('sensor-alerts')).toBeInTheDocument();
    // Each max temperature sits under its own component toggle, in toggle order.
    expect(maxTempSliders().map(sl => (sl as HTMLInputElement).value)).toEqual(['90', '85', '70', '60']);
  });

  it('groups each component toggle with its max temperature so a separator falls only between components', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    const cpuToggle = screen.getByRole('switch', { name: 'benchmark.phase.cpu' });
    const group = cpuToggle.closest('[class*="group"]') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.contains(maxTempSliders()[0])).toBe(true);
    expect(group.contains(maxTempSliders()[1])).toBe(false);
    expect(group.nextElementSibling?.contains(screen.getByRole('switch', { name: 'benchmark.phase.gpu' }))).toBe(true);
  });

  it('labels the cooling toggle as fans and pumps with its description', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    expect(screen.getByRole('switch', { name: 'diagnostics.settings.components.fansPumps.label' })).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.components.fansPumps.description')).toBeInTheDocument();
  });

  it('hides a component max temperature while that component is off, and leaves the others', () => {
    mockSettings = baseSettings({ diagnosticsComponentGpu: false, diagnosticsComponentRam: false });
    render(<SettingsTab />);
    expect(maxTempSliders().map(sl => (sl as HTMLInputElement).value)).toEqual(['90', '70']);
  });

  it('persists a threshold slider change on every onChange tick', () => {
    mockSettings = baseSettings();
    update.mockClear();
    render(<SettingsTab />);

    const cpuSlider = maxTempSliders()[0];
    fireEvent.change(cpuSlider, { target: { value: '92' } });
    expect(update).toHaveBeenCalledWith({ diagnosticsCpuTempC: 92 });

    fireEvent.change(cpuSlider, { target: { value: '95' } });
    expect(update).toHaveBeenCalledWith({ diagnosticsCpuTempC: 95 });
  });

  it('disables the per-type notification toggles while the master switch is off', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: false });
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.highTemp.label' }))
      .toBeDisabled();
    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.enable.label' }))
      .not.toBeDisabled();
  });

  it('enables the per-type notification toggles once the master switch is on', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: true });
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.highTemp.label' }))
      .not.toBeDisabled();
  });

  it('toggling the master notification switch calls update', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: false });
    update.mockClear();
    render(<SettingsTab />);

    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.enable.label' }));

    expect(update).toHaveBeenCalledWith({ diagnosticsNotificationsEnabled: true });
  });

  it('picking the "immediate" linger chip persists 0 minutes', () => {
    mockSettings = baseSettings({ diagnosticsWarningLingerMinutes: 60 });
    update.mockClear();
    render(<SettingsTab />);

    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.settings.linger.immediate' }));

    expect(update).toHaveBeenCalledWith({ diagnosticsWarningLingerMinutes: 0 });
  });

  it('reset asks for confirmation, then restores every contract default', () => {
    mockSettings = baseSettings({
      diagnosticsCpuTempC: 95,
      diagnosticsNotificationsEnabled: true,
      diagnosticsComponentGpu: false,
      diagnosticsIgnoredComponents: ['storage:Z52AFCNF'],
    });
    update.mockClear();
    render(<SettingsTab />);

    fireEvent.click(screen.getByText('cooling.settings.reset'));
    expect(update).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'cooling.settings.reset' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      diagnosticsCpuTempC: 90,
      diagnosticsGpuTempC: 85,
      diagnosticsStorageTempC: 70,
      diagnosticsRamTempC: 60,
      diagnosticsWarningLingerMinutes: 0,
      diagnosticsNotificationsEnabled: false,
      diagnosticsComponentCpu: true,
      diagnosticsComponentGpu: true,
      diagnosticsComponentStorage: true,
      diagnosticsComponentRam: true,
      diagnosticsComponentCooling: true,
      diagnosticsComponentSystem: true,
    }));
    // Per-device ignores survive a reset; they are undone on the device card.
    expect(update.mock.calls[0][0]).not.toHaveProperty('diagnosticsIgnoredComponents');
  });
});
