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
  it('has one master switch and one cooldown that write the health fields only', () => {
    mockSettings = { diagnosticsNotificationsEnabled: true, diagnosticsNotificationCooldownMinutes: 60 };
    update.mockClear();
    render(<DiagnosticsNotificationsSection />);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch', { name: 'settings.diagnosticsNotifications.health.label' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsNotificationsEnabled: false });
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.duration.minutes(m=30)' }));
    expect(update).toHaveBeenLastCalledWith({ diagnosticsNotificationCooldownMinutes: 30 });
  });

  it('disables the cooldown while notifications are off', () => {
    mockSettings = { diagnosticsNotificationsEnabled: false, diagnosticsNotificationCooldownMinutes: 60 };
    render(<DiagnosticsNotificationsSection />);
    expect(screen.getByRole('radio', { name: 'diagnostics.duration.minutes(m=30)' })).toBeDisabled();
  });
});

describe('DiagnosticsResetSection', () => {
  it('asks for confirmation, then restores the contract defaults and the built-in sensors', () => {
    mockSettings = { diagnosticsNotificationsEnabled: true, diagnosticsComponentGpu: false, diagnosticsIgnoredComponents: ['storage:Z52AFCNF'] };
    update.mockClear();
    render(<DiagnosticsResetSection />);
    expect(screen.getByText('settings.dangerZone')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cooling.settings.reset'));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'cooling.settings.reset' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      diagnosticsNotificationsEnabled: false,
      diagnosticsComponentGpu: true,
      diagnosticsComponentStorage: true,
      diagnosticsComponentRam: true,
      diagnosticsComponentCooling: true,
      diagnosticsComponentSystem: true,
    }));
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
