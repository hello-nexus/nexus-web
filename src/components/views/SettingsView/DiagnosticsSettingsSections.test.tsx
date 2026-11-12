import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticsNotificationsSection, DiagnosticsResetSection } from './DiagnosticsSettingsSections';

const update = vi.fn();
const resetBuiltIns = vi.fn().mockResolvedValue(true);
const push = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return { ...actual, useUiSettings: () => ({ settings: mockSettings, update, reload: vi.fn() }) };
});
vi.mock('../../../hooks/useSensorAlerts', () => ({ useSensorAlerts: () => ({ resetBuiltIns }) }));
vi.mock('../../common/Toast/Toast', () => ({ useToast: () => ({ push }) }));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

describe('DiagnosticsNotificationsSection', () => {
  it('shows the per-check switches and cooldown nested under the master while it is on', () => {
    mockSettings = { diagnosticsNotificationsEnabled: true, diagnosticsNotificationCooldownMinutes: 60, diagnosticsNotifyStorageHealth: true };
    update.mockClear();
    render(<DiagnosticsNotificationsSection />);
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.notify.storage' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsNotifyStorageHealth: false });
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.duration.minutes(m=30)' }));
    expect(update).toHaveBeenLastCalledWith({ diagnosticsNotificationCooldownMinutes: 30 });
    fireEvent.click(screen.getByRole('switch', { name: 'settings.diagnosticsNotifications.health.label' }));
    expect(update).toHaveBeenLastCalledWith({ diagnosticsNotificationsEnabled: false });
  });

  it('hides the dependents, rather than greying them, while the master is off', () => {
    mockSettings = { diagnosticsNotificationsEnabled: false, diagnosticsNotificationCooldownMinutes: 60 };
    render(<DiagnosticsNotificationsSection />);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('DiagnosticsResetSection', () => {
  it('asks for confirmation, then restores the contract defaults and the built-in sensors', () => {
    mockSettings = { diagnosticsNotificationsEnabled: false, diagnosticsIgnoredComponents: ['storage:Z52AFCNF'] };
    update.mockClear();
    render(<DiagnosticsResetSection />);
    expect(screen.getByText('settings.dangerZone')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cooling.settings.reset'));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'cooling.settings.reset' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      diagnosticsNotificationsEnabled: true,
      diagnosticsComponentRam: true,
      diagnosticsComponentSystem: true,
    }));
    for (const dropped of ['diagnosticsComponentGpu', 'diagnosticsComponentStorage', 'diagnosticsComponentCooling']) expect(update.mock.calls[0][0]).not.toHaveProperty(dropped);
    expect(update.mock.calls[0][0]).not.toHaveProperty('diagnosticsIgnoredComponents');
    expect(update.mock.calls[0][0]).not.toHaveProperty('diagnosticsSensorNotifications');
    expect(resetBuiltIns).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('toasts when the built-in restore is refused', async () => {
    mockSettings = {};
    resetBuiltIns.mockResolvedValueOnce(false);
    push.mockClear();
    render(<DiagnosticsResetSection />);
    fireEvent.click(screen.getByRole('button', { name: 'cooling.settings.reset' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'cooling.settings.reset' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith({ title: 'diagnostics.alerts.saveFailed' }));
  });
});
