import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../../../panel/types';

// Nexus Link on a promoted-monitor panel page (the Xeneon Edge and any other
// promoted display): turning it off calls DELETE /displays/{id}/panel
// (demoteDisplayPanel), which keeps the record but stops hosting the kiosk.
// The toggle only ever renders checked, since DevicePage's off-gate
// intercepts a disabled record before PanelDevicePage mounts - see
// DevicePage.tsx's offMonitorDisplayId branch and PanelDevicePage's
// isMonitorPanel comment.

const fetchPanelDevicesMock = vi.fn();
const demoteDisplayPanelMock = vi.fn();
const toastPushMock = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: toastPushMock }),
}));
vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: (...a: unknown[]) => demoteDisplayPanelMock(...a),
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
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'rec1' }),
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
import type { PanelConnectionKind, PanelDevice } from '../../../panel/device/panelDevices';

const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [{ id: 'p1', widgets: [] }],
  activePageId: 'p1',
};

function monitorDevice(): PanelDevice {
  return {
    id: 'display:rec1',
    name: 'Xeneon Edge',
    connectionKind: 'attached-monitor' as PanelConnectionKind,
    surfaceProfileKey: 'monitor-rec1',
    runtimeSurface: 'monitor',
    displayId: 'disp1',
    panelRecordId: 'rec1',
    capabilities: { surface: 'monitor', touch: true, displayControls: false, launchClose: false } as PanelDevice['capabilities'],
  } as PanelDevice;
}

function widgetPanelDevice(): PanelDevice {
  return {
    id: 'device:y70',
    name: 'Y70',
    connectionKind: 'attached-monitor' as PanelConnectionKind,
    surfaceProfileKey: 'y70-portrait',
    runtimeSurface: 'y70',
    capabilities: { surface: 'y70', touch: true, displayControls: true, launchClose: true } as PanelDevice['capabilities'],
  } as PanelDevice;
}

beforeEach(() => {
  demoteDisplayPanelMock.mockReset();
  toastPushMock.mockReset();
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'rec1', capabilities: { surface: 'monitor', touch: true }, layout: LAYOUT, reserveMonitor: true, enabled: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

describe('PanelDevicePage Nexus Link toggle', () => {
  it('renders checked for a promoted-monitor panel and turns it off on click', async () => {
    let resolveDemote: (v: { error?: boolean }) => void = () => {};
    demoteDisplayPanelMock.mockReturnValue(new Promise(resolve => { resolveDemote = resolve; }));

    render(<PanelDevicePage device={monitorDevice()} />);
    await waitFor(() => screen.getByTestId('embed'));

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).not.toBeDisabled();

    fireEvent.click(toggle);
    expect(demoteDisplayPanelMock).toHaveBeenCalledWith('disp1');
    expect(toggle).toBeDisabled();

    resolveDemote({ error: false });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toastPushMock).not.toHaveBeenCalled();
  });

  it('surfaces a toast and re-enables the toggle when the demote request fails', async () => {
    demoteDisplayPanelMock.mockResolvedValue(null);

    render(<PanelDevicePage device={monitorDevice()} />);
    await waitFor(() => screen.getByTestId('embed'));

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    fireEvent.click(toggle);

    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith({ title: 'displays.error.demote' }));
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('does not render the toggle for a non-promoted-monitor panel', async () => {
    render(<PanelDevicePage device={widgetPanelDevice()} />);
    await waitFor(() => screen.getByTestId('embed'));
    expect(screen.queryByRole('switch', { name: 'devices.nexusControl' })).toBeNull();
    expect(demoteDisplayPanelMock).not.toHaveBeenCalled();
  });
});
