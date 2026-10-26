import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A promoted monitor panel saves "always on top" per display on its record
// (absent = on), rendered beside the reserve toggle and gated the same way.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
const fetchDisplayTopologyMock = vi.fn();
const themeState = vi.hoisted(() => ({ backdrop: undefined as string | undefined }));

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: (...a: unknown[]) => fetchDisplayTopologyMock(...a),
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
    theme: { backdrop: themeState.backdrop, themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark', gaugeGradient: [] },
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
  themeState.backdrop = 'desktop';
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

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

const ALWAYS_ON_TOP_LABEL = 'devices.y70.panelAlwaysOnTop';
const RESERVE_LABEL = 'devices.y70.reserveMonitor';

function serveRecord(extra: Record<string, unknown> = {}) {
  fetchPanelDevicesMock.mockResolvedValue({
    devices: [{
      id: 'rec1',
      displayId: 'disp1',
      capabilities: { surface: 'monitor', touch: true, orientation: 'Landscape', ...(extra.family ? { family: extra.family } : {}) },
      ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'family')),
    }],
  });
}

describe('PanelDevicePage promoted display always on top', () => {
  it('defaults on when the record has no value and sits before the reserve toggle', async () => {
    serveRecord();
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    const all = screen.getAllByRole('switch');
    const reserve = screen.getByRole('switch', { name: RESERVE_LABEL });
    const lock = screen.getByRole('switch', { name: 'panel.widget.menu.lockWidgets' });
    expect(all.indexOf(lock)).toBe(all.indexOf(toggle) + 1);
    expect(all.indexOf(reserve)).toBe(all.indexOf(lock) + 1);
  });

  it('PATCHes alwaysOnTop:false when the default-on toggle is flipped', async () => {
    serveRecord();
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL });
    fireEvent.click(toggle);

    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { alwaysOnTop: false }));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a stored false as off', async () => {
    serveRecord({ alwaysOnTop: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('is offered even when the host cannot reserve monitors', async () => {
    serveRecord();
    fetchDisplayTopologyMock.mockResolvedValue({
      hostingSupported: true, rotationSupported: true, reserveSupported: false,
      positionsAvailable: true, revision: 1, displays: [], hint: '',
    });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    // The window level applies on every host that hosts panels; only the window guards are Windows-only.
    await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL });
    expect(screen.queryByRole('switch', { name: 'devices.y70.reserveMonitor' })).not.toBeInTheDocument();
  });

  it('reads off and disabled without the see-through background, keeping the stored value', async () => {
    themeState.backdrop = 'theme';
    serveRecord({ alwaysOnTop: true });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(patchPanelDeviceMock).not.toHaveBeenCalledWith('rec1', expect.objectContaining({ alwaysOnTop: expect.anything() }));
  });

  it('is not offered on a known device display such as the Xeneon Edge', async () => {
    serveRecord({ family: 'xeneon-edge' });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    await screen.findByRole('switch', { name: RESERVE_LABEL });
    expect(screen.queryByRole('switch', { name: ALWAYS_ON_TOP_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'panel.widget.menu.lockWidgets' })).not.toBeInTheDocument();
  });
});

describe('PanelDevicePage generic display empty-space menu', () => {
  const EMPTY_SPACE_MENU_LABEL = 'devices.panels.emptySpaceMenu';

  it('reads off and disabled while always on top forces click-through, whatever is stored', async () => {
    themeState.backdrop = 'desktop';
    serveRecord({ alwaysOnTop: true, clickThrough: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: EMPTY_SPACE_MENU_LABEL });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(patchPanelDeviceMock).not.toHaveBeenCalledWith('rec1', expect.objectContaining({ clickThrough: expect.anything() }));
  });

  it('restores the stored choice and enables the toggle once always on top is off', async () => {
    themeState.backdrop = 'desktop';
    serveRecord({ alwaysOnTop: true, clickThrough: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('switch', { name: ALWAYS_ON_TOP_LABEL }));
    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { alwaysOnTop: false }));
    const toggle = screen.getByRole('switch', { name: EMPTY_SPACE_MENU_LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { clickThrough: true }));
  });

  it('leaves a known device on its stored choice under always on top', async () => {
    themeState.backdrop = 'desktop';
    serveRecord({ family: 'xeneon-edge', alwaysOnTop: true, clickThrough: false });
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const toggle = await screen.findByRole('switch', { name: EMPTY_SPACE_MENU_LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).not.toBeDisabled();
  });
});
