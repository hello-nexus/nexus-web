import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

const fetchServiceMock = vi.fn();
const postServiceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: (...a: unknown[]) => fetchServiceMock(...a),
  postService: (...a: unknown[]) => postServiceMock(...a),
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
const fetchPreferencesMock = vi.fn();
const savePreferencesMock = vi.fn();
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: (...a: unknown[]) => fetchPreferencesMock(...a),
  savePreferences: (...a: unknown[]) => savePreferencesMock(...a),
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

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
  useToastSafe: () => ({ push: vi.fn() }),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const DEVICE: PanelDevice = {
  id: 'dev1',
  name: 'Y70',
  connectionKind: 'simulated',
  surfaceProfileKey: 'y70',
  runtimeSurface: 'y70',
  capabilities: { surface: 'y70', touch: true } as PanelDevice['capabilities'],
} as PanelDevice;

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({ devices: [] });
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchServiceMock.mockReset().mockResolvedValue(null);
  postServiceMock.mockReset().mockResolvedValue(null);
  savePreferencesMock.mockReset().mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

// No I18nProvider is mounted, so t() returns the raw key.
const TOGGLE_LABEL = 'devices.y70.panelAlwaysOnTop';
const RESERVE_LABEL = 'devices.y70.reserveMonitor';
const AUTO_LAUNCH_LABEL = 'devices.y70.panelAutoLaunch';

function servePrefs(panel: { reserveMonitor: boolean; alwaysOnTop?: boolean }) {
  fetchPreferencesMock.mockReset().mockResolvedValue({ panel: { autoLaunch: true, ...panel } });
}

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.settings' }));
}

describe('PanelDevicePage Y70 always on top', () => {
  it('shows the toggle directly under Show Panel whatever Keep panel clear is set to', async () => {
    servePrefs({ reserveMonitor: true, alwaysOnTop: true });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: TOGGLE_LABEL });
    await waitFor(() => expect(toggle).toBeChecked());
    const [autoLaunch, alwaysOnTop, reserve] = [AUTO_LAUNCH_LABEL, TOGGLE_LABEL, RESERVE_LABEL]
      .map(name => screen.getByRole('switch', { name }));
    const all = screen.getAllByRole('switch');
    expect(all.indexOf(alwaysOnTop)).toBe(all.indexOf(autoLaunch) + 1);
    expect(all.indexOf(reserve)).toBe(all.indexOf(alwaysOnTop) + 1);

    fireEvent.click(reserve);
    await waitFor(() => expect(reserve).not.toBeChecked());
    expect(screen.getByRole('switch', { name: TOGGLE_LABEL })).toBeEnabled();
  });

  it('reads the stored value and saves the flip', async () => {
    servePrefs({ reserveMonitor: true, alwaysOnTop: true });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: TOGGLE_LABEL });
    await waitFor(() => expect(toggle).toBeChecked());

    fireEvent.click(toggle);

    await waitFor(() => expect(savePreferencesMock).toHaveBeenCalledWith({ panel: { alwaysOnTop: false } }));
    expect(toggle).not.toBeChecked();
  });

  it('hides the toggle when the host predates the setting', async () => {
    servePrefs({ reserveMonitor: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const reserve = await screen.findByRole('switch', { name: RESERVE_LABEL });
    await waitFor(() => expect(reserve).not.toBeChecked());
    expect(screen.queryByRole('switch', { name: TOGGLE_LABEL })).not.toBeInTheDocument();
  });
});
