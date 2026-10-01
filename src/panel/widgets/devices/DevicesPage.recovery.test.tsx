import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirmwareStatusItem } from '../../../hooks/useFirmwareStatus';
import type { FlashStatus } from '../../../hooks/useFlashStatus';

// The service is mocked: these cover the UI states for a device stuck in update
// mode against the documented contract, not a real /devices/firmware/recover.

const refreshMock = vi.fn();
const recoverMock = vi.fn();

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../../components/common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }), useToastSafe: () => ({ push: vi.fn() }) }));
vi.mock('../../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: [], controlDevice: vi.fn() }),
}));
vi.mock('../../../hooks/useSystemSpecs', () => ({ useSystemSpecs: () => ({ specs: null }) }));

let mockStatus: FlashStatus | null = null;
vi.mock('../../../hooks/useFlashStatus', () => ({
  useFlashStatus: () => ({ status: mockStatus, startFlash: vi.fn(), refresh: vi.fn() }),
}));

let mockItems: FirmwareStatusItem[] = [];
vi.mock('../../../hooks/useFirmwareStatus', () => ({
  useFirmwareStatus: () => ({ items: mockItems, loaded: true, refresh: refreshMock }),
}));
vi.mock('../../../api/firmwareRecovery', () => ({
  recoverFirmware: (...args: unknown[]) => recoverMock(...args),
  fetchRecoveryRows: vi.fn(async () => []),
}));

let DevicesPage: typeof import('./DevicesPage').DevicesPage;

async function loadPage(devTools: boolean) {
  vi.stubEnv('DEV', devTools);
  vi.resetModules();
  ({ DevicesPage } = await import('./DevicesPage'));
}

afterAll(() => {
  vi.unstubAllEnvs();
});

function recoveryItem(over: Partial<FirmwareStatusItem> = {}): FirmwareStatusItem {
  return {
    deviceType: 'qseries', firmwareType: 'q60', name: 'HYTE Q60', category: 'cooling',
    currentVersion: '', availableVersion: '1.2.3', updateAvailable: false, availableVersions: [], devImages: [],
    needsRecovery: true, recoveryState: 'ready', ...over,
  };
}

function flash(over: Partial<FlashStatus> = {}): FlashStatus {
  return {
    active: true, deviceType: 'q60', version: '1.2.3', phase: 'downloading', percent: 40,
    message: 'Downloading', success: false, error: '', ...over,
  };
}

function renderFirmwareTab() {
  return render(
    <DevicesPage serviceOnline connectionState="open" onDeviceSelect={vi.fn()} tab="firmware" />,
  );
}

beforeEach(() => {
  refreshMock.mockReset();
  recoverMock.mockReset();
  mockStatus = null;
  mockItems = [];
});

describe('recovery row, release build', () => {
  beforeAll(() => loadPage(false));

  it('identifying shows a checking line and no Recover button', () => {
    mockItems = [recoveryItem({ recoveryState: 'identifying', firmwareType: '', availableVersion: '', deviceType: 'dfu-recovery', name: 'HYTE device' })];
    renderFirmwareTab();

    expect(screen.getAllByText('devices.firmware.recovery.checking').length).toBeGreaterThan(0);
    expect(screen.queryByText('devices.firmware.recovery.action')).toBeNull();
  });

  it('ready shows the banner and row, and Recover confirms then starts the recovery', async () => {
    recoverMock.mockResolvedValue({ started: true });
    mockItems = [recoveryItem()];
    renderFirmwareTab();

    expect(screen.getByRole('alert').textContent).toContain('devices.firmware.recovery.banner');
    expect(screen.getByText('devices.firmware.recovery.needed')).toBeTruthy();
    expect(screen.getAllByText('devices.firmware.recovery.action')).toHaveLength(2);

    fireEvent.click(screen.getAllByText('devices.firmware.recovery.action')[1]);
    expect(screen.getByText(/devices\.firmware\.recovery\.confirmMessage/).textContent)
      .toContain('"version":"1.2.3"');
    expect(recoverMock).not.toHaveBeenCalled();

    const buttons = screen.getAllByText('devices.firmware.recovery.action');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(recoverMock).toHaveBeenCalledWith('q60', '1.2.3'));
  });

  it('keeps the dialog open with the service message when the start is refused', async () => {
    recoverMock.mockResolvedValue({ error: true, msg: 'Another flash is running', started: false });
    mockItems = [recoveryItem()];
    renderFirmwareTab();

    fireEvent.click(screen.getAllByText('devices.firmware.recovery.action')[1]);
    const buttons = screen.getAllByText('devices.firmware.recovery.action');
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText('Another flash is running')).toBeTruthy();
  });

  it('unsupported tells the user to contact support and offers no action', () => {
    mockItems = [recoveryItem({ recoveryState: 'unsupported', firmwareType: '', availableVersion: '', deviceType: 'dfu-recovery', name: 'HYTE device' })];
    renderFirmwareTab();

    expect(screen.getAllByText('devices.firmware.recovery.contactSupport').length).toBeGreaterThan(0);
    expect(screen.queryByText('devices.firmware.recovery.action')).toBeNull();
    expect(screen.queryByText('devices.firmware.flash')).toBeNull();
  });

  it('shows flash progress instead of Recover while the recovery runs', () => {
    mockItems = [recoveryItem()];
    mockStatus = flash();
    renderFirmwareTab();

    expect(screen.getAllByText('Downloading (40%)').length).toBeGreaterThan(0);
    expect(screen.queryByText('devices.firmware.recovery.action')).toBeNull();
  });

  it('shows the restored text once the flash finished and before the row refreshes', () => {
    mockItems = [recoveryItem()];
    mockStatus = flash({ active: false, phase: 'done', percent: 100, success: true });
    renderFirmwareTab();

    expect(screen.getAllByText(/devices\.firmware\.recovery\.restored/).length).toBeGreaterThan(0);
    expect(screen.queryByText('devices.firmware.recovery.action')).toBeNull();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('renders no banner for normal rows', () => {
    mockItems = [recoveryItem({ needsRecovery: false, recoveryState: '', currentVersion: '1.0.0' })];
    renderFirmwareTab();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('recovery row, dev-tools build', () => {
  beforeAll(() => loadPage(true));

  it('unsupported offers the image picker and recovers with the picked image', async () => {
    recoverMock.mockResolvedValue({ started: true });
    mockItems = [recoveryItem({
      recoveryState: 'unsupported', firmwareType: '', availableVersion: '', deviceType: 'dfu-recovery', name: 'HYTE device',
      devImages: [{ firmwareType: 'np50', version: '2.0.0' }],
    })];
    renderFirmwareTab();

    const rowButton = screen.getByText('devices.firmware.recovery.action');
    fireEvent.click(rowButton);
    const buttons = screen.getAllByText('devices.firmware.recovery.action');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(recoverMock).toHaveBeenCalledWith('np50', '2.0.0'));
  });
});
