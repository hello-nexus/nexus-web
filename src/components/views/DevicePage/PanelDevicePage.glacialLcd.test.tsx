import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPanelDevicesMock = vi.fn();
const resetPanelDeviceHardwareMock = vi.fn();
const mockGlacialGet = vi.fn();
const mockGlacialSet = vi.fn();

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

vi.mock('../../../api/asus-glacial-lcd', () => ({
  getGlacialState: () => mockGlacialGet(),
  setGlacialSettings: (patch: unknown) => mockGlacialSet(patch),
  GLACIAL_STATE_CHANGED_EVENT: 'nexus:glacial-state-changed',
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

const DEVICE: PanelDevice = {
  id: 'display:rec1',
  name: 'ROG Crosshair X870E Glacial',
  connectionKind: 'attached-monitor',
  surfaceProfileKey: 'monitor-rec1',
  runtimeSurface: 'monitor',
  displayId: 'disp1',
  panelRecordId: 'rec1',
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: false,
  },
} as PanelDevice;

const glacialState = {
  isConnected: true,
  displayOn: true,
  mode: 'panel',
  panelModeAvailable: true,
  modeChosen: true,
  staticAsset: 3,
  animatedAsset: 0,
  slotCount: 1,
  slots: [
    { category: '', sensor: '', label: '', resolvedCategory: 'cpu', resolvedSensor: 'cpu-temp' },
    { category: '', sensor: '', label: '', resolvedCategory: 'gpu', resolvedSensor: 'gpu-temp' },
    { category: '', sensor: '', label: '', resolvedCategory: 'motherboard', resolvedSensor: 'mb-temp' },
  ],
  brightness: 50,
  stayOnWhileAsleep: false,
  staticAssets: [3, 4],
  animatedAssets: [0, 1],
};

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{
      id: 'rec1',
      displayId: 'disp1',
      capabilities: { surface: 'lcd-square', family: 'asus-glacial-lcd' },
    }],
  });
  resetPanelDeviceHardwareMock.mockReset().mockResolvedValue({ id: 'rec1' });
  mockGlacialGet.mockReset().mockResolvedValue(glacialState);
  mockGlacialSet.mockReset().mockResolvedValue(true);
});

describe('PanelDevicePage Glacial display controls', () => {
  it('embeds the Glacial controls in the Settings tab', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.settings' }));
    expect(await screen.findByRole('radio', { name: 'devices.asus-glacial-lcd.modePanel' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switching to a native mode from the panel page sends the mode', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.settings' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'devices.asus-glacial-lcd.modeMonitor' }));
    await waitFor(() => expect(mockGlacialSet).toHaveBeenCalledWith({ mode: 'monitor' }));
  });
});
