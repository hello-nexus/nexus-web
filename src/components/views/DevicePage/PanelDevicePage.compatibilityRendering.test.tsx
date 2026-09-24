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

function serveCompat(value: { enabled: boolean; supported: boolean } | null) {
  fetchServiceMock.mockImplementation((path: string) =>
    Promise.resolve(path === '/y70/compatibility-rendering' ? value : null));
}

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({ devices: [] });
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchServiceMock.mockReset();
  postServiceMock.mockReset().mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

// No I18nProvider is mounted, so t() returns the raw key.
const TOGGLE_LABEL = 'devices.y70.compatibilityRendering';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.settings' }));
}

describe('PanelDevicePage Y70 compatibility mode', () => {
  it('hides the toggle when the host does not support it', async () => {
    serveCompat({ enabled: false, supported: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    await waitFor(() => expect(fetchServiceMock).toHaveBeenCalledWith('/y70/compatibility-rendering'));
    expect(await screen.findByRole('switch', { name: 'devices.y70.forceOrientation' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: TOGGLE_LABEL })).not.toBeInTheDocument();
  });

  it('reads the stored value and posts the flip', async () => {
    serveCompat({ enabled: false, supported: true });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: TOGGLE_LABEL });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => expect(postServiceMock).toHaveBeenCalledWith('/y70/compatibility-rendering', { enabled: true }));
    expect(toggle).toBeChecked();
  });
});
