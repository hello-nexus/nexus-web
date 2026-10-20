import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../../../panel/types';

// A simulator edits only the record it allocated for itself: it never binds a
// real device's record found by surface, and takes the family of the device it
// stands in for. Layout engine is real; heavy leaves are stubbed.

const fetchPanelDevicesMock = vi.fn();
const fetchPanelDeviceMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
const allocatePanelDeviceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
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
vi.mock('./PanelPresetToolbar', () => ({ PanelPresetToolbar: () => null }));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: (...a: unknown[]) => allocatePanelDeviceMock(...a),
  deletePanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevice: (...a: unknown[]) => fetchPanelDeviceMock(...a),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDeviceMock(...a),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
  useMultiplex: () => ({ connected: true }),
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
  PanelWidgetCatalog: (props: { onAdd: (type: string, size: string) => void; canAddSize?: (size: string) => boolean }) => (
    <button
      data-testid="catalog-add"
      data-can-add={props.canAddSize ? String(props.canAddSize('2x2')) : 'unchecked'}
      onClick={() => props.onAdd('cooling', '2x2')}
    >add</button>
  ),
  catalogEntriesFor: () => [],
}));
vi.mock('../../../panel/editor/PanelThemeSettings', () => ({
  PanelThemeSettings: () => <div data-testid="theme" />,
}));
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: `name.${type}`, sizes: ['2x2', '2x4', '4x4'], defaultSize: '2x2', icon: () => null },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: (_meta: unknown, surface: string, _touch?: boolean, slots?: number) => (
    slots !== undefined ? ['2x2', '2x4'] : surface === 'q60' ? ['2x4'] : ['2x2', '4x4']
  ),
  appAvailableForSurface: () => true,
}));
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: { layout: PanelLayout; surface: string; deviceId?: string; onLayoutChange: (l: PanelLayout) => void }) => (
    <div
      data-testid="embed"
      data-surface={props.surface}
      data-device-id={props.deviceId ?? ''}
      data-layout-surface={props.layout.surface}
      data-widget-sizes={props.layout.pages.flatMap(pg => pg.widgets).map(w => w.size).join(',')}
    >
      <button data-testid="edit" onClick={() => props.onLayoutChange(props.layout)}>edit</button>
    </div>
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const SIM: PanelDevice = {
  id: 'simulated:lianli-tl-lcd-flex',
  name: 'Lian Li Uni Fan TL LCD Flex',
  sourceId: 'lianli-tl-lcd-flex',
  connectionKind: 'simulated',
  surfaceProfileKey: 'simulated-lianli-tl-lcd-flex',
  runtimeSurface: 'lcd-round',
  family: 'lianli-flex-lcd',
  previewSize: { width: 400, height: 400 },
  previewDpi: 210,
  capabilities: { surface: 'lcd-round', touch: false } as PanelDevice['capabilities'],
} as PanelDevice;

const REAL = {
  id: 'real-tl',
  displayName: 'Lian Li Uni Fan TL LCD',
  capabilities: { surface: 'lcd-round', family: 'lianli-tl-lcd', cssWidth: 400, cssHeight: 400, dpr: 1 },
};
const OWN = { id: 'sim-own', displayName: 'Lian Li Uni Fan TL LCD Flex' };

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  fetchPanelDevicesMock.mockReset();
  fetchPanelDeviceMock.mockReset().mockResolvedValue(OWN);
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  allocatePanelDeviceMock.mockReset().mockResolvedValue({ id: 'sim-new' });
  localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify(['lianli-tl-lcd-flex']));
});

async function renderPage() {
  render(<PanelDevicePage device={SIM} />);
  await waitFor(() => expect(fetchPanelDevicesMock).toHaveBeenCalled());
  await flush();
}

describe('PanelDevicePage simulator', () => {
  it('takes the family of the device it stands in for when no record family is matched', async () => {
    fetchPanelDevicesMock.mockResolvedValue({ devices: [] });
    const { container } = render(<PanelDevicePage device={SIM} />);
    await flush();

    expect(container.querySelector('[data-family]')?.getAttribute('data-family')).toBe('lianli-flex-lcd');
  });

  it('does not bind a real device record of the same surface', async () => {
    fetchPanelDevicesMock.mockResolvedValue({ devices: [REAL] });
    await renderPage();

    expect(screen.getByTestId('embed').dataset.deviceId).toBe('');
  });

  it('binds the record the simulator owns, not the real one listed first', async () => {
    localStorage.setItem('nexus_simulated_panel_records', JSON.stringify({ 'lianli-tl-lcd-flex': 'sim-own' }));
    fetchPanelDevicesMock.mockResolvedValue({ devices: [REAL, { ...OWN, capabilities: undefined }] });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId('embed').dataset.deviceId).toBe('sim-own'));
  });

  it('allocates its own surface-less record on the first edit and writes only to it', async () => {
    fetchPanelDevicesMock.mockResolvedValue({ devices: [REAL] });
    fetchPanelDeviceMock.mockResolvedValue(null);
    await renderPage();

    await act(async () => { fireEvent.click(screen.getByTestId('edit')); });

    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalled());
    expect(allocatePanelDeviceMock).toHaveBeenCalledTimes(1);
    expect(allocatePanelDeviceMock.mock.calls[0][0]).toBeUndefined();
    for (const [id] of patchPanelDeviceMock.mock.calls) expect(id).toBe('sim-new');
    expect(JSON.parse(localStorage.getItem('nexus_simulated_panel_records') ?? '{}')).toEqual({ 'lianli-tl-lcd-flex': 'sim-new' });
  });

  it('keeps the family layout surface on reload: an iCUE LINK 5" simulator at Large stays a single q60 tile', async () => {
    const lcd5 = {
      ...SIM,
      id: 'simulated:icue-link-lcd5',
      sourceId: 'icue-link-lcd5',
      runtimeSurface: 'monitor',
      family: 'icue-link-lcd5',
      previewSize: { width: 720, height: 1280 },
      previewDpi: 294,
      capabilities: { surface: 'monitor', touch: false },
    } as PanelDevice;
    localStorage.setItem('nexus_simulated_panel_records', JSON.stringify({ 'icue-link-lcd5': 'sim-lcd5' }));
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'sim-lcd5',
        displayName: 'sim',
        widgetSize: 'large',
        layout: {
          layoutSchemaVersion: 2,
          surface: 'q60',
          pages: [{ id: 'p1', widgets: [{ id: 'w', type: 'cooling', size: '2x4', col: 0, row: 0 }] }],
          activePageId: 'p1',
        },
      }],
    });
    render(<PanelDevicePage device={lcd5} />);
    await flush();

    await waitFor(() => expect(screen.getByTestId('embed').dataset.deviceId).toBe('sim-lcd5'));
    expect(screen.getByTestId('embed').dataset.surface).toBe('q60');
    expect(screen.getByTestId('embed').dataset.layoutSurface).toBe('q60');
    expect(screen.getByTestId('embed').dataset.widgetSizes).toBe('2x4');
  });
});
