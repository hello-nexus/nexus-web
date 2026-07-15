import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Corsair Xeneon Edge's native settings (brightness/backlight/contrast/
// RGB) replace the generic DDC brightness row for this curated family. The
// DDC path always reports unsupported for this family (DisplayBrightnessController
// suppresses it service-side), so the settings tab's visibility must not
// depend on ddcSupported/monitorRotation - only on the family match.

const fetchPanelDevicesMock = vi.fn();
const fetchXeneonEdgeSettingsMock = vi.fn();
const setXeneonEdgeSettingsMock = vi.fn();
const restoreXeneonEdgeColorsMock = vi.fn();

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
  fetchXeneonEdgeSettings: (...a: unknown[]) => fetchXeneonEdgeSettingsMock(...a),
  restoreXeneonEdgeColors: (...a: unknown[]) => restoreXeneonEdgeColorsMock(...a),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
  setXeneonEdgeSettings: (...a: unknown[]) => setXeneonEdgeSettingsMock(...a),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
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
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitWidgetBlur: vi.fn(),
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
import type { PanelDevice } from '../../../panel/device/panelDevices';

const DEVICE: PanelDevice = {
  id: 'display:rec1',
  name: 'Xeneon Edge',
  connectionKind: 'attached-monitor',
  surfaceProfileKey: 'monitor-rec1',
  runtimeSurface: 'monitor',
  displayId: 'disp1',
  panelRecordId: 'rec1',
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: true,
  },
} as PanelDevice;

const SETTINGS_TAB = 'devices.y70.tab.settings';
const BRIGHTNESS_LABEL = 'devices.y70.brightness';
const BACKLIGHT_LABEL = 'devices.xeneonEdge.backlight';
const CONTRAST_LABEL = 'devices.xeneonEdge.contrast';
const RED_LABEL = 'devices.xeneonEdge.red';
const GREEN_LABEL = 'devices.xeneonEdge.green';
const BLUE_LABEL = 'devices.xeneonEdge.blue';
const RESTORE_LABEL = 'devices.xeneonEdge.restoreColors';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{
      id: 'rec1',
      displayId: 'disp1',
      capabilities: { surface: 'monitor', touch: true, family: 'xeneon-edge', orientation: 'Landscape' },
    }],
  });
  fetchXeneonEdgeSettingsMock.mockReset().mockResolvedValue({
    brightness: 42, backlight: 80, contrast: 55, red: 200, green: 90, blue: 30,
  });
  setXeneonEdgeSettingsMock.mockReset().mockResolvedValue(null);
  restoreXeneonEdgeColorsMock.mockReset().mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

describe('PanelDevicePage Xeneon Edge native settings', () => {
  it('keeps the Settings tab reachable even though DDC brightness is unsupported for this family', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    expect(await screen.findByRole('tab', { name: SETTINGS_TAB })).toBeInTheDocument();
  });

  it('renders all six controls with the values read from the panel', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    expect(await screen.findByRole('slider', { name: BRIGHTNESS_LABEL })).toHaveValue('42');
    expect(screen.getByRole('slider', { name: BACKLIGHT_LABEL })).toHaveValue('80');
    expect(screen.getByRole('slider', { name: CONTRAST_LABEL })).toHaveValue('55');
    expect(screen.getByRole('slider', { name: RED_LABEL })).toHaveValue('200');
    expect(screen.getByRole('slider', { name: GREEN_LABEL })).toHaveValue('90');
    expect(screen.getByRole('slider', { name: BLUE_LABEL })).toHaveValue('30');
  });

  it('does not write on every drag tick, only commits once on pointer-up', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const redSlider = await screen.findByRole('slider', { name: RED_LABEL });
    fireEvent.change(redSlider, { target: { value: '10' } });
    fireEvent.change(redSlider, { target: { value: '20' } });
    fireEvent.change(redSlider, { target: { value: '30' } });
    expect(setXeneonEdgeSettingsMock).not.toHaveBeenCalled();

    fireEvent.pointerUp(redSlider);
    await waitFor(() => expect(setXeneonEdgeSettingsMock).toHaveBeenCalledWith('disp1', { red: 30 }));
    expect(setXeneonEdgeSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('restores only red/green/blue and leaves brightness/backlight/contrast untouched', async () => {
    restoreXeneonEdgeColorsMock.mockResolvedValue({
      brightness: null, backlight: null, contrast: null, red: 151, green: 127, blue: 139,
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('button', { name: RESTORE_LABEL }));
    await waitFor(() => expect(restoreXeneonEdgeColorsMock).toHaveBeenCalledWith('disp1'));

    await waitFor(() => expect(screen.getByRole('slider', { name: RED_LABEL })).toHaveValue('151'));
    expect(screen.getByRole('slider', { name: GREEN_LABEL })).toHaveValue('127');
    expect(screen.getByRole('slider', { name: BLUE_LABEL })).toHaveValue('139');
    // Untouched by the restore response (still the values read on open).
    expect(screen.getByRole('slider', { name: BRIGHTNESS_LABEL })).toHaveValue('42');
    expect(screen.getByRole('slider', { name: BACKLIGHT_LABEL })).toHaveValue('80');
    expect(screen.getByRole('slider', { name: CONTRAST_LABEL })).toHaveValue('55');
  });
});
