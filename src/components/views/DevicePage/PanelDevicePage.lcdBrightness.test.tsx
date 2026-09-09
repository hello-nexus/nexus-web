import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Lian Li AIO LCDs (Galahad II, HydroShift) take a backlight command, so
// their settings tab carries the same brightness slider the Q-series hub gets.
// The service stamps supportsBrightness on the record and the row keys off
// that, not off a model list. The value lives on the record, so a write is a
// broadcast to every subscribed panel client - hence commit-only persistence.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
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
  id: 'lianli-galahad2-lcd',
  name: 'Lian Li Galahad II LCD',
  connectionKind: 'usb',
  surfaceProfileKey: 'lcd-round',
  runtimeSurface: 'lcd-round',
  panelRecordId: 'rec1',
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: false,
  },
} as PanelDevice;

const record = (supportsBrightness: boolean, lcdBrightness?: number) => ({
  devices: [{
    id: 'rec1',
    lcdBrightness,
    capabilities: {
      surface: 'lcd-round', touch: false, family: 'lianli-galahad2-lcd', supportsBrightness,
    },
  }],
});

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => vi.restoreAllMocks());

// No I18nProvider is mounted, so t() returns the raw key; querying by key
// keeps this independent of copy.
const SETTINGS_TAB = 'devices.y70.tab.settings';
const BRIGHTNESS_LABEL = 'devices.y70.brightness';

async function openSettingsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: SETTINGS_TAB }));
}

describe('PanelDevicePage cooler-LCD brightness', () => {
  it('starts at full backlight when the record carries no setting', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record(true));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const slider = await screen.findByRole('slider', { name: BRIGHTNESS_LABEL }) as HTMLInputElement;
    expect(slider.value).toBe('100');
  });

  it('reads the record value and persists on commit as lcdBrightness', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record(true, 40));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const slider = await screen.findByRole('slider', { name: BRIGHTNESS_LABEL }) as HTMLInputElement;
    expect(slider.value).toBe('40');

    fireEvent.change(slider, { target: { value: '65' } });
    fireEvent.keyUp(slider);

    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalledWith('rec1', { lcdBrightness: 65 }));
    // Exactly once: the slider fires onChange(commit) AND onCommit for a typed
    // edit, so persisting from both would double the write this rework exists
    // to cut.
    expect(patchPanelDeviceMock).toHaveBeenCalledTimes(1);
  });

  it('previews a drag without writing the record on every tick', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record(true, 40));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    const slider = await screen.findByRole('slider', { name: BRIGHTNESS_LABEL }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.change(slider, { target: { value: '60' } });

    // A record write fans out a broadcast to every subscribed panel client, so
    // the intermediate steps must stay local.
    expect(slider.value).toBe('60');
    expect(patchPanelDeviceMock).not.toHaveBeenCalled();
  });

  it('never shows the row for a cooler LCD with no backlight command', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record(false));
    render(<PanelDevicePage device={DEVICE} />);
    await openSettingsTab();

    // The mounting section still renders, so the tab is open and the slider's
    // absence is the capability gate rather than an unrendered tab.
    expect(await screen.findByRole('switch', { name: 'devices.lcd.flip180' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: BRIGHTNESS_LABEL })).not.toBeInTheDocument();
  });
});
