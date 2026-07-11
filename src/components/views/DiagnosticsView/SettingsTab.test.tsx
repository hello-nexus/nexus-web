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

describe('SettingsTab', () => {
  it('renders the section titles and per-component sliders', () => {
    mockSettings = baseSettings();
    update.mockClear();
    render(<SettingsTab />);

    expect(screen.getByText('diagnostics.settings.thresholds.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.linger.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.notifications.title')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.settings.components.title')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /benchmark\.phase\.cpu/ })).toHaveValue('90');
    expect(screen.getByRole('slider', { name: /benchmark\.phase\.gpu/ })).toHaveValue('85');
    expect(screen.getByRole('slider', { name: /benchmark\.phase\.storage/ })).toHaveValue('70');
    expect(screen.getByRole('slider', { name: /benchmark\.phase\.ram/ })).toHaveValue('60');
  });

  it('persists a threshold slider change on every onChange tick', () => {
    mockSettings = baseSettings();
    update.mockClear();
    render(<SettingsTab />);

    const cpuSlider = screen.getByRole('slider', { name: /benchmark\.phase\.cpu/ });
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

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.settings.linger.immediate' }));

    expect(update).toHaveBeenCalledWith({ diagnosticsWarningLingerMinutes: 0 });
  });

  it('reset asks for confirmation, then restores every contract default', () => {
    mockSettings = baseSettings({
      diagnosticsCpuTempC: 95,
      diagnosticsNotificationsEnabled: true,
      diagnosticsComponentGpu: false,
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
  });
});
