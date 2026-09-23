import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Aftershock Glacier Matrix cooler LCD (zmatrices-lcd) can hand its
// screen to Windows as a secondary monitor. Gated on capabilities.
// supportsSecondaryMonitor rather than the family string, so any future
// driver that supports it needs no change here.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: vi.fn().mockResolvedValue({
    hostingSupported: false,
    rotationSupported: false,
    reserveSupported: false,
    positionsAvailable: false,
    revision: 1,
    displays: [],
    hint: '',
  }),
  fetchXeneonEdgeSettings: vi.fn().mockResolvedValue(null),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
  setXeneonEdgeSettings: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'rec1' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDeviceMock(...a),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));
vi.mock('../../../panel/engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
}));
vi.mock('../../../panel/theme/panelTheme', () => ({
  usePanelTheme: () => ({
    theme: { themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark', gaugeGradient: [] },
    commitThemeSync: vi.fn(), commitThemeMode: vi.fn(), commitAccentSync: vi.fn(),
    previewAccent: vi.fn(), commitAccent: vi.fn(), previewBackground: vi.fn(),
    commitBackground: vi.fn(), commitBackgroundMode: vi.fn(), commitBackgroundEffect: vi.fn(),
    commitBackgroundTemplate: vi.fn(), previewBackgroundEffectState: vi.fn(), commitBackgroundEffectState: vi.fn(),
    previewBackgroundOpacity: vi.fn(), commitBackgroundOpacity: vi.fn(), previewWidgetOpacity: vi.fn(),
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitBackgroundFrost: vi.fn(),
  }),
  buildPanelThemeVars: () => ({}),
  panelAccentColor: () => '#2563eb',
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
import type { PanelDevice } from '../../../panel/device/panelDevices';

const DEVICE: PanelDevice = {
  id: 'zmatrices-lcd',
  name: 'Aftershock Glacier Matrix LCD',
  connectionKind: 'usb',
  surfaceProfileKey: 'lcd-wide',
  runtimeSurface: 'lcd-wide',
  panelRecordId: 'rec1',
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: false,
  },
} as PanelDevice;

const record = (opts: {
  supportsSecondaryMonitor?: boolean;
  secondaryMonitor?: boolean;
  secondaryMonitorState?: 'starting' | 'active' | 'driver-missing' | 'failed' | null;
} = {}) => ({
  devices: [{
    id: 'rec1',
    secondaryMonitor: opts.secondaryMonitor,
    secondaryMonitorState: opts.secondaryMonitorState,
    capabilities: {
      surface: 'lcd-wide', touch: false, family: 'zmatrices-lcd',
      supportsSecondaryMonitor: opts.supportsSecondaryMonitor,
    },
  }],
});

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => vi.restoreAllMocks());

// No I18nProvider is mounted, so t() returns the raw key; querying by key
// keeps this independent of copy.
const SETTINGS_TAB = 'devices.y70.tab.settings';
const TOGGLE_LABEL = 'devices.lcd.secondaryMonitor';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

describe('PanelDevicePage secondary monitor', () => {
  it('hides the setting when the capability is absent', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record({ supportsSecondaryMonitor: false }));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    await waitFor(() => expect(fetchPanelDevicesMock).toHaveBeenCalled());
    expect(screen.queryByRole('switch', { name: TOGGLE_LABEL })).not.toBeInTheDocument();
  });

  it('reads the persisted value and patches secondaryMonitor on toggle', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record({ supportsSecondaryMonitor: true, secondaryMonitor: false }));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: TOGGLE_LABEL });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { secondaryMonitor: true }));
  });

  it('shows the driver-missing warning when on and the state says so', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record({
      supportsSecondaryMonitor: true, secondaryMonitor: true, secondaryMonitorState: 'driver-missing',
    }));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    expect(await screen.findByText('devices.lcd.secondaryMonitorDriverMissing')).toBeInTheDocument();
  });

  it('disables the Widgets tab body and shows the notice while it is on', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record({ supportsSecondaryMonitor: true, secondaryMonitor: true }));
    render(<PanelDevicePage device={DEVICE} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.widgets' }));

    expect(await screen.findByText('devices.lcd.secondaryMonitorNotice')).toBeInTheDocument();
    const catalog = await screen.findByTestId('catalog');
    expect(catalog.closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
