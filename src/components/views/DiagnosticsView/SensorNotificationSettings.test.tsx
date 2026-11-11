import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SensorNotificationSettings } from './SensorNotificationSettings';

const update = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUiSettings: () => ({ settings: mockSettings, update, reload: vi.fn() }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key),
  }),
}));

describe('SensorNotificationSettings', () => {
  it('writes the master switch and the cooldown', () => {
    mockSettings = { diagnosticsSensorNotifications: true, diagnosticsSensorCooldownMinutes: 60 };
    update.mockClear();
    render(<SensorNotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.sensors.notifications.master.label' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsSensorNotifications: false });
    fireEvent.click(screen.getByRole('radio', { name: 'diagnostics.duration.minutes(30)' }));
    expect(update).toHaveBeenCalledWith({ diagnosticsSensorCooldownMinutes: 30 });
  });

  it('disables the cooldown while the master switch is off', () => {
    mockSettings = { diagnosticsSensorNotifications: false, diagnosticsSensorCooldownMinutes: 60 };
    render(<SensorNotificationSettings />);
    expect(screen.getByRole('radio', { name: 'diagnostics.duration.minutes(30)' })).toBeDisabled();
  });
});
