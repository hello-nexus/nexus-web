import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsTab } from './SettingsTab';

const update = vi.fn();
const resetBuiltIns = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return {
    ...actual,
    useUiSettings: () => ({ settings: mockSettings, update, reload: vi.fn() }),
  };
});

vi.mock('../../../api/diagnosticsAlerts', () => ({ resetBuiltInSensorAlerts: () => resetBuiltIns() }));

// The alerts section has its own suite and reads sensors and the service.

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    diagnosticsNotificationsEnabled: false,
    diagnosticsNotifyStorageHealth: false,
    diagnosticsNotifyCooling: false,
    diagnosticsNotifyMemoryTest: false,
    diagnosticsNotifySystemDevices: false,
    diagnosticsNotifyGpuThrottle: false,
    diagnosticsNotificationCooldownMinutes: 60,
    diagnosticsSensorNotifications: true,
    diagnosticsSensorCooldownMinutes: 60,
    diagnosticsComponentGpu: true,
    diagnosticsComponentStorage: true,
    diagnosticsComponentRam: true,
    diagnosticsComponentCooling: true,
    diagnosticsComponentSystem: true,
    ...overrides,
  };
}

describe('SettingsTab', () => {
  it('orders the sections components, notifications, then the danger zone with the reset', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    const order = [
      screen.getByText('diagnostics.settings.components.title'),
      screen.getByText('diagnostics.settings.notifications.title'),
      screen.getByText('settings.dangerZone'),
      screen.getByText('diagnostics.settings.reset.label'),
    ];
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('has no sensor alert rules: tracked sensors are managed on the Sensors tab', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    expect(screen.queryByText('diagnostics.alerts.customTitle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'diagnostics.sensors.add' })).toBeNull();
  });

  it('renders the section titles, with plain health toggles and no temperature limits or warning duration', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);

    expect(screen.getByText('diagnostics.settings.notifications.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.components.title')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.settings.linger.title')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'benchmark.phase.cpu' })).toBeNull();
    for (const phase of ['gpu', 'storage', 'ram']) {
      expect(screen.getByRole('switch', { name: `benchmark.phase.${phase}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('switch', { name: 'diagnostics.settings.notifications.highTemp.label' })).toBeNull();
  });

  it('labels the cooling toggle as fans and pumps with its description', () => {
    mockSettings = baseSettings();
    render(<SettingsTab />);
    expect(screen.getByRole('switch', { name: 'diagnostics.settings.components.fansPumps.label' })).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.components.fansPumps.description')).toBeInTheDocument();
  });

  it('disables the per-type notification toggles while the master switch is off', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: false });
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.storageHealth.label' }))
      .toBeDisabled();
    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.enable.label' }))
      .not.toBeDisabled();
  });

  it('enables the per-type notification toggles once the master switch is on', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: true });
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.storageHealth.label' }))
      .not.toBeDisabled();
  });

  it('toggling the master notification switch calls update', () => {
    mockSettings = baseSettings({ diagnosticsNotificationsEnabled: false });
    update.mockClear();
    render(<SettingsTab />);

    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.settings.notifications.enable.label' }));

    expect(update).toHaveBeenCalledWith({ diagnosticsNotificationsEnabled: true });
  });

  it('reset asks for confirmation, then restores every contract default', () => {
    mockSettings = baseSettings({
      diagnosticsNotificationsEnabled: true,
      diagnosticsSensorNotifications: false,
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
      diagnosticsNotificationsEnabled: false,
      diagnosticsSensorNotifications: true,
      diagnosticsSensorCooldownMinutes: 60,
      diagnosticsComponentGpu: true,
      diagnosticsComponentStorage: true,
      diagnosticsComponentRam: true,
      diagnosticsComponentCooling: true,
      diagnosticsComponentSystem: true,
    }));
    expect(resetBuiltIns).toHaveBeenCalledTimes(1);
    // Per-device ignores survive a reset; they are undone on the device card.
    expect(update.mock.calls[0][0]).not.toHaveProperty('diagnosticsIgnoredComponents');
  });
});
