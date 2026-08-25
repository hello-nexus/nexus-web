import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirmwareStatusItem } from '../../../hooks/useFirmwareStatus';

// availableUnknown ("could not reach the manifest") must stay distinguishable
// from updateAvailable=false ("checked, nothing newer"): only the first leaves a
// panel awaiting its app install with no version to offer, so it owns the row.

const refreshMock = vi.fn();

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../../components/common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: [], controlDevice: vi.fn() }),
}));
vi.mock('../../../hooks/useSystemSpecs', () => ({ useSystemSpecs: () => ({ specs: null }) }));
vi.mock('../../../hooks/useFlashStatus', () => ({
  useFlashStatus: () => ({ status: null, startFlash: vi.fn() }),
}));

let mockItems: FirmwareStatusItem[] = [];
vi.mock('../../../hooks/useFirmwareStatus', () => ({
  useFirmwareStatus: () => ({ items: mockItems, loaded: true, refresh: refreshMock }),
}));

// DEV_TOOLS inside DevicesPage is `import.meta.env.DEV || __DEV_TOOLS__`, a
// module-level const, and vitest sets DEV true. Stub the env and re-import so the
// const is re-evaluated; both flavours matter, since every local/lab build ships
// DEV_TOOLS=1 while releases do not.
let DevicesPage: typeof import('./DevicesPage').DevicesPage;

async function loadPage(devTools: boolean) {
  vi.stubEnv('DEV', devTools);
  vi.resetModules();
  ({ DevicesPage } = await import('./DevicesPage'));
}

afterAll(() => {
  vi.unstubAllEnvs();
});

function panelAppItem(overrides: Partial<FirmwareStatusItem> = {}): FirmwareStatusItem {
  return {
    deviceType: 'qseries-app',
    firmwareType: 'qseries-app',
    name: 'Q60 Panel App',
    category: 'display',
    currentVersion: '',
    availableVersion: '',
    updateAvailable: false,
    availableUnknown: false,
    availableVersions: [],
    devImages: [],
    ...overrides,
  };
}

function renderFirmwareTab() {
  return render(
    <DevicesPage serviceOnline connectionState="open" onDeviceSelect={vi.fn()} tab="firmware" />,
  );
}

describe('firmware row when the version check itself failed', () => {
  beforeAll(() => loadPage(false));
  beforeEach(() => {
    refreshMock.mockReset();
    mockItems = [];
  });

  it('offers a retry instead of a bare Unknown when the manifest was unreachable', () => {
    mockItems = [panelAppItem({ availableUnknown: true })];
    renderFirmwareTab();

    expect(screen.getByText('devices.firmware.status.checkFailed')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.status.unknown')).toBeNull();

    fireEvent.click(screen.getByText('devices.firmware.retryCheck'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('still offers Install once the manifest reports a version for an uninstalled app', () => {
    mockItems = [panelAppItem({ availableVersion: '0.1.4', updateAvailable: true })];
    renderFirmwareTab();

    expect(screen.getByText('devices.firmware.install')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.status.checkFailed')).toBeNull();
  });

  it('keeps the plain Unknown label when the check succeeded and there is simply nothing to offer', () => {
    mockItems = [panelAppItem()];
    renderFirmwareTab();

    expect(screen.getByText('devices.firmware.status.unknown')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.retryCheck')).toBeNull();
  });
});

// The dev picker short-circuits the whole status chain, so without the branch
// being hoisted above it a lab build renders an empty Select plus a disabled
// Flash - the same dead end, on exactly the machines used to verify the fix.
describe('dev-tools build', () => {
  beforeAll(() => loadPage(true));
  beforeEach(() => {
    refreshMock.mockReset();
    mockItems = [];
  });

  it('shows the retry rather than an empty version picker when the check failed', () => {
    mockItems = [panelAppItem({ availableUnknown: true })];
    renderFirmwareTab();

    expect(screen.getByText('devices.firmware.status.checkFailed')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.flash')).toBeNull();
  });

  it('still renders the version picker when there are images to choose', () => {
    mockItems = [panelAppItem({
      currentVersion: '0.1.3',
      availableVersion: '0.1.4',
      devImages: [{ firmwareType: 'qseries-app', version: '0.1.4' }],
    })];
    renderFirmwareTab();

    expect(screen.getByText('devices.firmware.flash')).toBeTruthy();
    expect(screen.queryByText('devices.firmware.status.checkFailed')).toBeNull();
  });
});
