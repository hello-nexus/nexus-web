import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MONO_STEP_INTERCEPT } from './monoPreview';

// The Apex Pro TKL OLED is a 128x40 1-bit streamed panel (surface lcd-wide). Its
// page keeps the preview in the right column and shows the glass's 1-bit look.

const fetchPanelDevicesMock = vi.fn();

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
vi.mock('./PanelPresetToolbar', () => ({ PanelPresetToolbar: () => null }));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
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
import type { PanelDevice } from '../../../panel/device/panelDevices';

const apex = (family: string, previewSize: { width: number; height: number }): PanelDevice => ({
  id: `stream:${family}`,
  name: 'SteelSeries Apex Pro TKL OLED',
  connectionKind: 'usb',
  surfaceProfileKey: 'lcd-wide',
  runtimeSurface: 'lcd-wide',
  panelRecordId: 'rec1',
  family,
  previewSize,
  capabilities: {
    layout: true, theme: true, displayControls: false, launchClose: false,
    pairing: false, presence: false, touch: false,
  },
} as PanelDevice);

const record = (family: string) => ({
  devices: [{ id: 'rec1', capabilities: { surface: 'lcd-wide', touch: false, family } }],
});

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
});

describe('PanelDevicePage Apex OLED preview', () => {
  it('keeps the preview in the right column with the 1-bit filter', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record('steelseries-apex-oled'));
    const { container } = render(<PanelDevicePage device={apex('steelseries-apex-oled', { width: 128, height: 40 })} />);

    const embed = await screen.findByTestId('embed');
    const pane = embed.closest('[data-family]') as HTMLElement;
    expect(pane.getAttribute('data-family')).toBe('steelseries-apex-oled');
    expect(pane.hasAttribute('data-mono')).toBe(true);
    expect(container.querySelector('[data-layout="columns"]')).not.toBeNull();
    expect(container.querySelector('[data-layout="stacked"]')).toBeNull();
    expect(pane.previousElementSibling?.className).toMatch(/leftPane/);
    expect(await screen.findByTestId('mono-preview-filter')).toBeInTheDocument();
    expect(MONO_STEP_INTERCEPT).toBeLessThan(0);
  });

  it('still docks another wide strip glass under the options, unfiltered', async () => {
    fetchPanelDevicesMock.mockResolvedValue(record('thermalright-lcd'));
    const { container } = render(<PanelDevicePage device={apex('thermalright-lcd', { width: 1920, height: 462 })} />);

    await screen.findByTestId('embed');
    expect(container.querySelector('[data-layout="stacked"]')).not.toBeNull();
    expect(screen.queryByTestId('mono-preview-filter')).toBeNull();
  });
});
