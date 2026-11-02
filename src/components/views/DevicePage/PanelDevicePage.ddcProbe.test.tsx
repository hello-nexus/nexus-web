import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
const fetchDisplaysMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: () => fetchDisplaysMock(),
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
vi.mock('./PanelPresetToolbar', () => ({ PanelPresetToolbar: () => null }));
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

import { PanelDevicePage, DDC_PROBE_MS } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const DEVICE: PanelDevice = {
  id: 'y70-monitor',
  name: 'Monitor',
  connectionKind: 'usb',
  surfaceProfileKey: 'lcd-wide',
  runtimeSurface: 'lcd-wide',
  panelRecordId: 'rec1',
  displayId: 'disp1',
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: false,
  },
} as PanelDevice;

const unsupported = { displays: [{ id: 'disp1', brightnessControl: { supported: false } }] };
const supported = { displays: [{ id: 'disp1', brightnessControl: { supported: true, current: 40 } }] };

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'rec1', capabilities: { surface: 'lcd-wide', touch: false, family: 'monitor' } }],
  });
  fetchDisplaysMock.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('PanelDevicePage monitor brightness probe', () => {
  it('gives up after the probe deadline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchDisplaysMock.mockResolvedValue(unsupported);
    render(<PanelDevicePage device={DEVICE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(21 * 60_000); });
    const calls = fetchDisplaysMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(fetchDisplaysMock).toHaveBeenCalledTimes(calls);
  });

  it('refetches until the display reports DDC support, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchDisplaysMock.mockResolvedValueOnce(unsupported).mockResolvedValue(supported);
    render(<PanelDevicePage device={DEVICE} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchDisplaysMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(DDC_PROBE_MS); });
    expect(fetchDisplaysMock).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchDisplaysMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('tab', { name: 'devices.y70.tab.settings' })).toBeInTheDocument();
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchDisplaysMock.mockResolvedValue(unsupported);
    const { unmount } = render(<PanelDevicePage device={DEVICE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    const calls = fetchDisplaysMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchDisplaysMock).toHaveBeenCalledTimes(calls);
  });
});
