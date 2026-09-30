import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import type { FirmwareStatusItem } from '../../../hooks/useFirmwareStatus';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';

// Rendered outside I18nProvider, so t() falls back to raw keys. The service
// endpoints are mocked: this covers the banner wiring, not the real service.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({ channels: [] })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
  };
});

const fetchRecoveryRows = vi.fn();
const recoverFirmware = vi.fn();
vi.mock('../../../api/firmwareRecovery', () => ({
  fetchRecoveryRows: () => fetchRecoveryRows(),
  recoverFirmware: (...args: unknown[]) => recoverFirmware(...args),
}));
vi.mock('../../../hooks/useFlashStatus', () => ({
  useFlashStatus: () => ({ status: null, startFlash: vi.fn(), refresh: vi.fn() }),
}));

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

const ROW = {
  deviceType: 'qseries', firmwareType: 'q60', name: 'HYTE Q60', category: 'cooling',
  currentVersion: '', availableVersion: '1.2.3', updateAvailable: false, availableVersions: [], devImages: [],
  needsRecovery: true, recoveryState: 'ready',
} as FirmwareStatusItem;

function renderPage() {
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

describe('CoolingPage recovery banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows no banner when nothing is stuck in update mode', async () => {
    fetchRecoveryRows.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(fetchRecoveryRows).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the banner for a ready device and Recover confirms then starts the recovery', async () => {
    fetchRecoveryRows.mockResolvedValue([ROW]);
    recoverFirmware.mockResolvedValue({ started: true });
    renderPage();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('devices.firmware.recovery.banner');

    fireEvent.click(screen.getByText('devices.firmware.recovery.action'));
    expect(recoverFirmware).not.toHaveBeenCalled();
    const buttons = screen.getAllByText('devices.firmware.recovery.action');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(recoverFirmware).toHaveBeenCalledWith('q60', '1.2.3'));
  });

  it('shows the checking line without an action while the device is identified', async () => {
    fetchRecoveryRows.mockResolvedValue([{ ...ROW, recoveryState: 'identifying', firmwareType: '', availableVersion: '' }]);
    renderPage();

    await screen.findByRole('alert');
    expect(screen.getByText('devices.firmware.recovery.checking')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.recovery.action')).toBeNull();
  });
});
