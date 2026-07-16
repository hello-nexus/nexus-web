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
const restoreXeneonEdgeDefaultsMock = vi.fn();

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
  restoreXeneonEdgeDefaults: (...a: unknown[]) => restoreXeneonEdgeDefaultsMock(...a),
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
const RESTORE_LABEL = 'devices.xeneonEdge.restoreDefaults';

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
  restoreXeneonEdgeDefaultsMock.mockReset().mockResolvedValue(null);
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

  it('shows the value the panel applied, not the one requested', async () => {
    // A 0x0f ack means the panel received the write, not that it committed it.
    // The response carries what actually landed, so the slider must follow it
    // rather than the request. Both values are in range: an out-of-range one
    // would be clamped by the range input itself and prove nothing.
    setXeneonEdgeSettingsMock.mockResolvedValue({
      brightness: null, backlight: null, contrast: null, red: 200, green: null, blue: null,
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const redSlider = await screen.findByRole('slider', { name: RED_LABEL });
    fireEvent.change(redSlider, { target: { value: '100' } });
    fireEvent.pointerUp(redSlider);

    await waitFor(() => expect(setXeneonEdgeSettingsMock).toHaveBeenCalledWith('disp1', { red: 100 }));
    await waitFor(() => expect(screen.getByRole('slider', { name: RED_LABEL })).toHaveValue('200'));
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

  it('restores every control to its factory value, not just the colors', async () => {
    restoreXeneonEdgeDefaultsMock.mockResolvedValue({
      brightness: 50, backlight: 100, contrast: 50, red: 151, green: 127, blue: 139,
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('button', { name: RESTORE_LABEL }));
    await waitFor(() => expect(restoreXeneonEdgeDefaultsMock).toHaveBeenCalledWith('disp1'));

    await waitFor(() => expect(screen.getByRole('slider', { name: RED_LABEL })).toHaveValue('151'));
    expect(screen.getByRole('slider', { name: GREEN_LABEL })).toHaveValue('127');
    expect(screen.getByRole('slider', { name: BLUE_LABEL })).toHaveValue('139');
    // The panel's own 0xff command only covers RGB, so the service writes all
    // six: the sliders must land on their factory values too, not stay put.
    expect(screen.getByRole('slider', { name: BRIGHTNESS_LABEL })).toHaveValue('50');
    expect(screen.getByRole('slider', { name: BACKLIGHT_LABEL })).toHaveValue('100');
    expect(screen.getByRole('slider', { name: CONTRAST_LABEL })).toHaveValue('50');
  });

  it('disables every slider while a restore is in flight', async () => {
    let resolveRestore: (v: { brightness: number; backlight: number; contrast: number; red: number; green: number; blue: number }) => void = () => {};
    restoreXeneonEdgeDefaultsMock.mockReturnValue(new Promise(resolve => { resolveRestore = resolve; }));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('button', { name: RESTORE_LABEL }));

    // A restore rewrites all six over a serialized HID channel, so a drag on
    // any of them would race a value it is about to overwrite.
    await waitFor(() => expect(screen.getByRole('slider', { name: RED_LABEL })).toBeDisabled());
    expect(screen.getByRole('slider', { name: GREEN_LABEL })).toBeDisabled();
    expect(screen.getByRole('slider', { name: BLUE_LABEL })).toBeDisabled();
    expect(screen.getByRole('slider', { name: BRIGHTNESS_LABEL })).toBeDisabled();
    expect(screen.getByRole('slider', { name: BACKLIGHT_LABEL })).toBeDisabled();
    expect(screen.getByRole('slider', { name: CONTRAST_LABEL })).toBeDisabled();

    resolveRestore({ brightness: 50, backlight: 100, contrast: 50, red: 151, green: 127, blue: 139 });
    await waitFor(() => expect(screen.getByRole('slider', { name: RED_LABEL })).not.toBeDisabled());
  });
});
