import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Q60/Q80 panel lifecycle (NEX-14): restart and factory reset for the panel's
// Android side. A PC shutdown cuts panel power without letting Android
// power-cycle, so these are the user's clean reboot and their way back from a
// corrupted panel. Both are Q-series-only - no other surface runs an APK we
// install - and both return once QUEUED, so the busy state must be driven by a
// completion signal rather than the call resolving.

const fetchPanelDevicesMock = vi.fn();
const rebootQSeriesPanelMock = vi.fn();
const factoryResetQSeriesPanelMock = vi.fn();
const toastPushMock = vi.fn();
const fetchPanelDeviceMock = vi.fn();

// The page treats a missing qseries-app firmware item as "panel USB detached"
// and renders the disconnected state instead of any tab, so a reachable panel
// with qshell installed is the precondition for these controls existing.
const APP_ITEM = {
  deviceType: 'qseries-app',
  firmwareType: 'qseries-app',
  name: 'Q60 Panel App',
  category: 'display',
  currentVersion: '3.1.0',
  availableVersion: '3.1.0',
  updateAvailable: false,
  availableVersions: ['3.1.0'],
  devImages: [],
};

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn((url: string) =>
    url === '/devices/firmware/status'
      ? Promise.resolve([APP_ITEM])
      : Promise.resolve(null)),
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
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'q1' }),
  fetchPanelDevice: (...a: unknown[]) => fetchPanelDeviceMock(...a),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
  resetPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
  resetPanelDeviceHardware: vi.fn().mockResolvedValue({ id: 'q1' }),
  factoryResetPanelDevice: (...a: unknown[]) => factoryResetQSeriesPanelMock(...a),
}));
vi.mock('../../../api/qseries', () => ({
  getQSeriesRotation: vi.fn().mockResolvedValue({ orientation: 'Portrait' }),
  setQSeriesRotation: vi.fn().mockResolvedValue({ ok: true }),
  getQSeriesDisplay: vi.fn().mockResolvedValue({ brightness: 100, screenOff: false, sleepWithHost: true, sleepWhenLocked: true }),
  setQSeriesDisplay: vi.fn().mockResolvedValue({ ok: true }),
  rebootQSeriesPanel: (...a: unknown[]) => rebootQSeriesPanelMock(...a),
}));
let topicHandler: ((raw: unknown) => void) | null = null;
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, _on: boolean, cb: (raw: unknown) => void) => {
    if (topic === 'panel/device') topicHandler = cb;
  },
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
vi.mock('./QSeriesCoolerSettings', () => ({
  QSeriesCoolerSettings: () => <div data-testid="cooler-settings" />,
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: toastPushMock }),
  useToastSafe: () => ({ push: toastPushMock }),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const Q60_DEVICE: PanelDevice = {
  id: 'q60',
  name: 'Q60',
  connectionKind: 'usb',
  surfaceProfileKey: 'q60',
  runtimeSurface: 'q60',
  panelRecordId: 'q1',
  capabilities: {
    layout: true, theme: true, displayControls: true, launchClose: false,
    pairing: false, presence: false, touch: true,
  },
} as PanelDevice;

const MONITOR_DEVICE: PanelDevice = {
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
const REBOOT_BUTTON = 'devices.q60.rebootPanel.button';
const REBOOT_CONFIRM = 'devices.q60.rebootPanel.confirmButton';
const REBOOT_BUSY = 'devices.q60.rebootPanel.busy';
const RESET_BUTTON = 'devices.q60.factoryResetPanel.button';
const RESET_CONFIRM = 'devices.q60.factoryResetPanel.confirmButton';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

beforeEach(() => {
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{
      id: 'q1',
      capabilities: { surface: 'q60', touch: true, orientation: 'Portrait' },
    }],
  });
  toastPushMock.mockReset();
  topicHandler = null;
  fetchPanelDeviceMock.mockReset().mockResolvedValue(null);
  rebootQSeriesPanelMock.mockReset().mockResolvedValue({ ok: true });
  factoryResetQSeriesPanelMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => vi.restoreAllMocks());

describe('PanelDevicePage Q-series panel lifecycle', () => {
  it('offers restart and factory reset on a Q60', async () => {
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();

    expect(await screen.findByRole('button', { name: REBOOT_BUTTON })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RESET_BUTTON })).toBeInTheDocument();
  });

  it('shows the danger zone on a connected Q60 before its panel record exists', async () => {
    // The record is created by the panel page's first successful load, so a
    // Q60 whose page never loaded has none. Reboot panel takes no record id
    // and stays live; the record-bound resets disable rather than vanish.
    fetchPanelDevicesMock.mockResolvedValue({ devices: [] });
    render(<PanelDevicePage device={{ ...Q60_DEVICE, panelRecordId: undefined } as PanelDevice} />);
    await openSettingsTab();

    expect(await screen.findByRole('button', { name: REBOOT_BUTTON })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: RESET_BUTTON })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.panels.resetHardware.button' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.panels.resetPersonalization.button' })).toBeDisabled();
  });

  it('binds the record the rebooted panel creates and completes the reboot', async () => {
    // With no record bound, the topic handler cannot key on a deviceId; the
    // frame announcing the new record must bind it, which both arms the
    // record-bound resets and ends the reboot once lastSeenAt is past the
    // request. Otherwise the only exit is the completion timeout's toast.
    fetchPanelDevicesMock.mockResolvedValue({ devices: [] });
    render(<PanelDevicePage device={{ ...Q60_DEVICE, panelRecordId: undefined } as PanelDevice} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));
    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled());

    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{ id: 'q1', lastSeenAt: Date.now() + 60_000, capabilities: { surface: 'q60', touch: true } }],
    });
    topicHandler?.({ deviceId: 'q1' });

    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUTTON })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: RESET_BUTTON })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.panels.resetHardware.button' })).not.toBeDisabled();
  });

  it('keeps the reboot busy when the record it binds predates the request', async () => {
    // Binding alone proves nothing: a record last seen before the request is
    // the panel's pre-reboot state (or another client's write).
    fetchPanelDevicesMock.mockResolvedValue({ devices: [] });
    render(<PanelDevicePage device={{ ...Q60_DEVICE, panelRecordId: undefined } as PanelDevice} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));
    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled());

    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{ id: 'q1', lastSeenAt: 1, capabilities: { surface: 'q60', touch: true } }],
    });
    topicHandler?.({ deviceId: 'q1' });

    // The bind itself lands (the resets arm) while the reboot stays pending.
    await waitFor(() => expect(screen.getByRole('button', { name: 'devices.panels.resetHardware.button' })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled();
  });

  it('hides the danger zone on a simulated panel', async () => {
    // A simulator carries no panelRecordId and binds the real panel's record
    // through the surface scan, so its resets would wipe the physical device.
    render(<PanelDevicePage device={{ ...Q60_DEVICE, id: 'simulated-q60', connectionKind: 'simulated', panelRecordId: undefined } as PanelDevice} />);
    await openSettingsTab();
    await screen.findByTestId('cooler-settings');

    expect(screen.queryByRole('button', { name: REBOOT_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.panels.resetHardware.button' })).not.toBeInTheDocument();
  });

  it('offers neither on a non-Q-series panel', async () => {
    // Only the Q-series runs a Nexus-installed APK; a monitor surface has
    // nothing to reboot or reinstall, so both rows must stay Q-series-only.
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'rec1',
        displayId: 'disp1',
        capabilities: { surface: 'monitor', touch: true, family: 'xeneon-edge', orientation: 'Landscape' },
      }],
    });
    render(<PanelDevicePage device={MONITOR_DEVICE} />);
    await openSettingsTab();
    await screen.findByRole('button', { name: 'devices.panels.resetHardware.button' });

    expect(screen.queryByRole('button', { name: REBOOT_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RESET_BUTTON })).not.toBeInTheDocument();
  });

  it('requires the confirm before rebooting', async () => {
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    expect(rebootQSeriesPanelMock).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));
    await waitFor(() => expect(rebootQSeriesPanelMock).toHaveBeenCalledTimes(1));
  });

  it('requires the confirm before factory resetting', async () => {
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();

    fireEvent.click(await screen.findByRole('button', { name: RESET_BUTTON }));
    expect(factoryResetQSeriesPanelMock).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: RESET_CONFIRM }));
    await waitFor(() => expect(factoryResetQSeriesPanelMock).toHaveBeenCalledWith('q1'));
  });

  it('holds the reboot button busy after a queued request', async () => {
    // The POST returns once the reboot is QUEUED; the panel is unreachable for
    // ~2 min afterwards, so the button must not re-arm when the call resolves.
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));

    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled());
  });

  it('re-arms the reboot button when the service rejects the request', async () => {
    // A null result means no panel was connected or an install holds the
    // transport - nothing was queued, so the user must be able to retry.
    rebootQSeriesPanelMock.mockResolvedValue(null);
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));

    await waitFor(() => expect(rebootQSeriesPanelMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUTTON })).not.toBeDisabled());
  });

  it('re-arms the factory reset button when the service rejects the request', async () => {
    factoryResetQSeriesPanelMock.mockResolvedValue(null);
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: RESET_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: RESET_CONFIRM }));

    await waitFor(() => expect(factoryResetQSeriesPanelMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: RESET_BUTTON })).not.toBeDisabled());
  });
  it('keeps the reboot busy until lastSeenAt advances past the request', async () => {
    // The topic frame carries no payload and fires for this client's own writes,
    // so its arrival alone must not end the reboot.
    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: REBOOT_CONFIRM }));
    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled());

    // A stale record (panel last seen before the request) must not clear it.
    fetchPanelDeviceMock.mockResolvedValue({ id: 'q1', lastSeenAt: 1 });
    topicHandler?.({ deviceId: 'q1' });
    await waitFor(() => expect(fetchPanelDeviceMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: REBOOT_BUSY })).toBeDisabled();

    // The panel re-contacting the service after the request is the real signal.
    fetchPanelDeviceMock.mockResolvedValue({ id: 'q1', lastSeenAt: Date.now() + 60_000 });
    topicHandler?.({ deviceId: 'q1' });
    await waitFor(() => expect(screen.getByRole('button', { name: REBOOT_BUTTON })).not.toBeDisabled());
  });

  it('does not treat a previous run\'s terminal flash status as this reset finishing', async () => {
    // useFlashStatus must drop the prior run's done/failed when it re-enables,
    // or a retried reset reports complete before the reinstall has started.
    const { useFlashStatus } = await import('../../../hooks/useFlashStatus');
    expect(typeof useFlashStatus).toBe('function');

    render(<PanelDevicePage device={Q60_DEVICE} />);
    await openSettingsTab();
    fireEvent.click(await screen.findByRole('button', { name: RESET_BUTTON }));
    fireEvent.click(await screen.findByRole('button', { name: RESET_CONFIRM }));

    await waitFor(() => expect(factoryResetQSeriesPanelMock).toHaveBeenCalled());
    // The status fetch is stubbed null here, so a completion toast at this point
    // could only come from a status the hook failed to clear.
    await waitFor(() => expect(toastPushMock).toHaveBeenCalled());
    const titles = toastPushMock.mock.calls.map(c => c[0]?.title);
    expect(titles).not.toContain('devices.q60.factoryResetPanel.done');
  });
});
