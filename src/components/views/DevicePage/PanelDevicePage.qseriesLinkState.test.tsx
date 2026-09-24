import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../../../panel/types';

// GET /qseries/link (new endpoint) splits the old single "disconnected" empty
// state into three: unplugged, USB-enumerated-but-adb-wedged, and Windows
// holding a deferred USB reset that only a host restart clears. All three
// still gate on the qseries-app firmware item being absent (showDisconnected),
// same as PanelDevicePage.fwgate.test.tsx; this file covers only the copy and
// action branching driven by the link-state payload itself.

let firmwareItems: unknown[] = [];
let currentLinkState: {
  usbPresent: boolean;
  adbOnline: boolean;
  offlineSeconds: number;
  hostRebootPending: boolean;
  serial: string | null;
} | null = null;

const fetchPanelDevicesMock = vi.fn();
const repairQSeriesLinkMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn((url: string) => {
    if (url === '/devices/firmware/status') return Promise.resolve(firmwareItems);
    if (url === '/qseries/link') return Promise.resolve(currentLinkState);
    return Promise.resolve(null);
  }),
  postService: vi.fn((url: string) => {
    if (url === '/qseries/link/repair') return repairQSeriesLinkMock();
    return Promise.resolve(null);
  }),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: vi.fn().mockResolvedValue(null),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
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

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelConnectionKind, PanelDevice } from '../../../panel/device/panelDevices';

const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'q60',
  pages: [{ id: 'p1', widgets: [] }],
  activePageId: 'p1',
};

function q60Device(connectionKind: PanelConnectionKind): PanelDevice {
  return {
    id: 'dev1',
    name: 'Q60',
    connectionKind,
    surfaceProfileKey: 'q60',
    runtimeSurface: 'q60',
    capabilities: { surface: 'q60', touch: false } as PanelDevice['capabilities'],
  } as PanelDevice;
}

beforeEach(() => {
  firmwareItems = [];
  currentLinkState = null;
  repairQSeriesLinkMock.mockReset().mockResolvedValue({ error: false, msg: 'Ok' });
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'q60', touch: false }, layout: LAYOUT, reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

const DISCONNECTED_TITLE = 'devices.qseries.disconnected.title';
const UNRESPONSIVE_TITLE = 'devices.qseries.unresponsive.title';
const UNRESPONSIVE_CTA = 'devices.qseries.unresponsive.cta';
const NEEDS_HOST_REBOOT_TITLE = 'devices.qseries.needsHostReboot.title';

describe('PanelDevicePage Q-series link-state branching', () => {
  it('shows the unplugged copy when the link endpoint reports usbPresent=false', async () => {
    currentLinkState = { usbPresent: false, adbOnline: false, offlineSeconds: 0, hostRebootPending: false, serial: null };
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByText(DISCONNECTED_TITLE));
    expect(screen.queryByText(UNRESPONSIVE_TITLE)).toBeNull();
    expect(screen.queryByText(NEEDS_HOST_REBOOT_TITLE)).toBeNull();
  });

  it('shows the unresponsive copy with a repair action when USB is present but adb is offline', async () => {
    currentLinkState = { usbPresent: true, adbOnline: false, offlineSeconds: 412, hostRebootPending: false, serial: 'ABC' };
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByText(UNRESPONSIVE_TITLE));
    expect(screen.queryByText(DISCONNECTED_TITLE)).toBeNull();
    expect(screen.queryByText(NEEDS_HOST_REBOOT_TITLE)).toBeNull();
    expect(screen.getByRole('button', { name: UNRESPONSIVE_CTA })).toBeInTheDocument();
  });

  it('shows the host-reboot copy with no action when Windows deferred the USB reset', async () => {
    currentLinkState = { usbPresent: true, adbOnline: false, offlineSeconds: 900, hostRebootPending: true, serial: 'ABC' };
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    await waitFor(() => screen.getByText(NEEDS_HOST_REBOOT_TITLE));
    expect(screen.queryByText(DISCONNECTED_TITLE)).toBeNull();
    expect(screen.queryByText(UNRESPONSIVE_TITLE)).toBeNull();
    expect(screen.queryByRole('button', { name: UNRESPONSIVE_CTA })).toBeNull();
  });

  it('posts a repair on click and reflects the recovered link state once adb comes back', async () => {
    currentLinkState = { usbPresent: true, adbOnline: false, offlineSeconds: 60, hostRebootPending: false, serial: 'ABC' };
    repairQSeriesLinkMock.mockImplementation(() => {
      currentLinkState = { usbPresent: true, adbOnline: true, offlineSeconds: 0, hostRebootPending: false, serial: 'ABC' };
      return Promise.resolve({ error: false, msg: 'Ok' });
    });
    render(<PanelDevicePage device={q60Device('usb-display')} />);
    fireEvent.click(await screen.findByRole('button', { name: UNRESPONSIVE_CTA }));
    expect(repairQSeriesLinkMock).toHaveBeenCalledTimes(1);
    // adbOnline flips true but the firmware-status gate (showDisconnected) hasn't
    // caught up yet in this test, so the branch falls back to the generic
    // disconnected copy rather than staying on the now-stale unresponsive one.
    await waitFor(() => screen.getByText(DISCONNECTED_TITLE));
    expect(screen.queryByText(UNRESPONSIVE_TITLE)).toBeNull();
  });
});
