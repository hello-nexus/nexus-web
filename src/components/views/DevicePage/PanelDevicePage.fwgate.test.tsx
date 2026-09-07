import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../../../panel/types';

// Drives the Q-series firmware-gate / disconnected-state derivation with the
// real PanelDevicePage. The service emits the qseries-app firmware item only
// while the panel is adb-reachable, so:
//   item absent            -> panel USB detached -> disconnected state
//   item present, ver ""   -> reachable, qshell missing -> install gate
//   item present, ver set  -> normal page content
// Simulated panels get neither state.

let firmwareItems: unknown[] = [];

const fetchPanelDevicesMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn((url: string) =>
    url === '/devices/firmware/status'
      ? Promise.resolve(firmwareItems)
      : Promise.resolve(null)),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: vi.fn().mockResolvedValue(null),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));
vi.mock('../../../panel/engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
}));
vi.mock('../../../panel/theme/panelTheme', () => ({
  usePanelTheme: () => ({
    theme: { themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark' },
    commitThemeSync: vi.fn(), commitThemeMode: vi.fn(), commitAccentSync: vi.fn(),
    previewAccent: vi.fn(), commitAccent: vi.fn(), previewBackground: vi.fn(),
    commitBackground: vi.fn(), commitBackgroundMode: vi.fn(), commitBackgroundEffect: vi.fn(),
    commitBackgroundTemplate: vi.fn(), previewBackgroundEffectState: vi.fn(), commitBackgroundEffectState: vi.fn(),
    previewBackgroundOpacity: vi.fn(), commitBackgroundOpacity: vi.fn(), previewWidgetOpacity: vi.fn(),
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitBackgroundFrost: vi.fn(),
  }),
  buildPanelThemeVars: () => ({}),
  useResolvedPanelThemeMode: () => 'dark',
}));
vi.mock('../../../panel/editor/PanelWidgetCatalog', () => ({
  PanelWidgetCatalog: () => <div data-testid="catalog" />,
}));
vi.mock('../../../panel/editor/PanelThemeSettings', () => ({
  PanelThemeSettings: () => <div data-testid="theme" />,
}));
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: 'k', sizes: ['2x2'], defaultSize: '2x2', icon: () => null },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: () => ['2x2'],
  appAvailableForSurface: () => true,
}));
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: () => <div data-testid="embed" />,
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelConnectionKind, PanelDevice } from '../../../panel/device/panelDevices';

const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'q60',
  pages: [{ id: 'p1', widgets: [] }],
  activePageId: 'p1',
};

function q60Device(connectionKind: PanelConnectionKind): PanelDevice {
  return {
    id: 'dev1',
    name: 'Q60',
    connectionKind,
    surfaceProfileKey: 'q60',
    runtimeSurface: 'q60',
    capabilities: { surface: 'q60', touch: false } as PanelDevice['capabilities'],
  } as PanelDevice;
}

const APP_ITEM = (currentVersion: string) => ({
  deviceType: 'qseries-app',
  firmwareType: 'qseries-app',
  name: 'Q60 Panel App',
  category: 'display',
  currentVersion,
  availableVersion: '3.1.0',
  updateAvailable: currentVersion === '',
  availableVersions: ['3.1.0'],
  devImages: [],
});

beforeEach(() => {
  firmwareItems = [];
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'q60', touch: false }, layout: LAYOUT, reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

const DISCONNECTED_TITLE = 'devices.qseries.disconnected.title';
const FWGATE_TITLE = 'devices.qseries.fwGate.title';

describe('PanelDevicePage Q-series firmware gate vs disconnected state', () => {
  it('shows the disconnected state when the qseries-app item is absent (panel USB detached)', async () => {
    firmwareItems = [];
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByText(DISCONNECTED_TITLE));
    expect(screen.queryByText(FWGATE_TITLE)).toBeNull();
  });

  it('shows the install gate when the panel is reachable but qshell is not installed', async () => {
    firmwareItems = [APP_ITEM('')];
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByText(FWGATE_TITLE));
    expect(screen.queryByText(DISCONNECTED_TITLE)).toBeNull();
  });

  it('shows normal content when qshell is installed', async () => {
    firmwareItems = [APP_ITEM('3.1.0')];
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByTestId('embed'));
    expect(screen.queryByText(FWGATE_TITLE)).toBeNull();
    expect(screen.queryByText(DISCONNECTED_TITLE)).toBeNull();
  });

  it('shows neither state for a simulated Q60', async () => {
    firmwareItems = [];
    render(<PanelDevicePage device={q60Device('simulated')} />);
    await waitFor(() => screen.getByTestId('embed'));
    expect(screen.queryByText(FWGATE_TITLE)).toBeNull();
    expect(screen.queryByText(DISCONNECTED_TITLE)).toBeNull();
  });
});
