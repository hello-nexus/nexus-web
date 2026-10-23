import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPanelDevicesMock = vi.fn();
const resetPanelDeviceHardwareMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: vi.fn().mockResolvedValue({
    hostingSupported: true,
    rotationSupported: false,
    reserveSupported: false,
    positionsAvailable: true,
    revision: 1,
    displays: [],
    hint: '',
  }),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('./PanelPresetToolbar', () => ({ PanelPresetToolbar: () => null }));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
  resetPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
  resetPanelDeviceHardware: (...a: unknown[]) => resetPanelDeviceHardwareMock(...a),
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

vi.mock('./KrakenCoolerSettings', () => ({
  KrakenCoolerSettings: () => <div data-testid="kraken-cooler-settings" />,
}));
vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({ resolve: () => undefined }),
  SensorPicker: () => <div data-testid="sensor-picker" />,
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
  useToastSafe: () => ({ push: vi.fn() }),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const CAPS = {
  layout: true, theme: true, displayControls: false, launchClose: false,
  pairing: false, presence: false, touch: false,
};

const device = (over: Partial<PanelDevice>): PanelDevice => ({
  id: 'stream:rec1',
  name: 'Cooler LCD',
  connectionKind: 'usb-display',
  surfaceProfileKey: 'stream-rec1',
  runtimeSurface: 'lcd-round',
  panelRecordId: 'rec1',
  capabilities: CAPS,
  ...over,
} as PanelDevice);

const SETTINGS_TAB = 'devices.y70.tab.settings';
const MOUNTING = 'devices.lcd.mounting';

function serve(family: string, surface = 'lcd-round') {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'rec1', capabilities: { surface, family, touch: false, cssWidth: 640, cssHeight: 640, dpi: 240 } }],
  });
}

beforeEach(() => {
  resetPanelDeviceHardwareMock.mockReset().mockResolvedValue({ id: 'rec1' });
});

describe('PanelDevicePage Kraken cooler settings on the lcd-round surface', () => {
  it('shows the cooler settings for a real Kraken and not the mount orientation section', async () => {
    serve('nzxt-kraken');
    render(<PanelDevicePage device={device({ sourceId: 'nzxt-kraken' })} />);
    fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));

    expect(await screen.findByTestId('kraken-cooler-settings')).toBeInTheDocument();
    expect(screen.queryByText(MOUNTING)).toBeNull();
  });

  it('shows them from the record family alone, before the cooler row is claimed', async () => {
    serve('nzxt-kraken');
    render(<PanelDevicePage device={device({})} />);
    fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));

    expect(await screen.findByTestId('kraken-cooler-settings')).toBeInTheDocument();
  });

  it('keeps them off a simulated Kraken', async () => {
    serve('nzxt-kraken');
    render(<PanelDevicePage device={device({ connectionKind: 'simulated', sourceId: 'kraken', family: 'nzxt-kraken', panelRecordId: 'rec1' })} />);
    await screen.findByTestId('embed');

    expect(screen.queryByRole('tab', { name: SETTINGS_TAB })).toBeNull();
    expect(screen.queryByTestId('kraken-cooler-settings')).toBeNull();
  });

  it('keeps them off a round cooler from another vendor, which still gets mount orientation', async () => {
    serve('lianli-galahad2-lcd');
    render(<PanelDevicePage device={device({ sourceId: 'lianli-galahad2-lcd' })} />);
    fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));

    expect(await screen.findByText(MOUNTING)).toBeInTheDocument();
    expect(screen.queryByTestId('kraken-cooler-settings')).toBeNull();
  });
});
