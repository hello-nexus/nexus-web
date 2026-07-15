import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A real promoted Xeneon Edge monitor carries a physical orientation sensor
// (capabilities.family === 'xeneon-edge'). Auto-orient defaults on and hides
// the manual 4-way orientation picker; turning it off persists autoOrient
// and reveals the picker. Any other promoted monitor (no curated family)
// never sees the toggle at all - it keeps the manual-only picker.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
const fetchDisplayTopologyMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: (...a: unknown[]) => fetchDisplayTopologyMock(...a),
  fetchXeneonEdgeSettings: vi.fn().mockResolvedValue(null),
  restoreXeneonEdgeColors: vi.fn().mockResolvedValue(null),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
  setXeneonEdgeSettings: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
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

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchDisplayTopologyMock.mockReset().mockResolvedValue({
    hostingSupported: true,
    rotationSupported: true,
    reserveSupported: true,
    positionsAvailable: true,
    revision: 1,
    displays: [],
    hint: '',
  });
});

afterEach(() => vi.restoreAllMocks());

// No I18nProvider is mounted, so useTranslation's default context value
// (t returns the raw key) is what renders - the same fallback
// DevicePage.panelLinkOff.test.tsx reproduces by mocking t() explicitly.
// Querying by raw key keeps this test independent of copy.
const SETTINGS_TAB = 'devices.y70.tab.settings';
const AUTO_ORIENT_LABEL = 'devices.xeneonEdge.autoOrient';
const ORIENTATION_LABEL = 'devices.y70.orientation';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

describe('PanelDevicePage Xeneon Edge auto-orient', () => {
  it('defaults on and hides the manual orientation picker', async () => {
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'rec1',
        displayId: 'disp1',
        capabilities: { surface: 'monitor', touch: true, family: 'xeneon-edge', orientation: 'Landscape' },
      }],
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: AUTO_ORIENT_LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: ORIENTATION_LABEL })).not.toBeInTheDocument();
  });

  it('turning it off persists autoOrient:false and reveals the picker', async () => {
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'rec1',
        displayId: 'disp1',
        capabilities: { surface: 'monitor', touch: true, family: 'xeneon-edge', orientation: 'Landscape' },
      }],
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: AUTO_ORIENT_LABEL });
    fireEvent.click(toggle);

    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { autoOrient: false }));
    expect(await screen.findByRole('button', { name: ORIENTATION_LABEL })).toBeInTheDocument();
  });

  it('starts off and shows the picker when the record already has autoOrient:false', async () => {
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'rec1',
        displayId: 'disp1',
        autoOrient: false,
        capabilities: { surface: 'monitor', touch: true, family: 'xeneon-edge', orientation: 'Landscape' },
      }],
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: AUTO_ORIENT_LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await screen.findByRole('button', { name: ORIENTATION_LABEL })).toBeInTheDocument();
  });

  it('never shows the toggle for a promoted monitor outside the curated family', async () => {
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'rec1',
        displayId: 'disp1',
        capabilities: { surface: 'monitor', touch: true, orientation: 'Landscape' },
      }],
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    expect(await screen.findByRole('button', { name: ORIENTATION_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: AUTO_ORIENT_LABEL })).not.toBeInTheDocument();
  });
});
