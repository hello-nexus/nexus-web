import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';

// The Widget size switch on a panel that offers it (the iCUE LINK 5" LCD), and the
// single page a non-touch panel keeps. Layout engine and switch logic are real;
// heavy leaves (catalog, theme, iframe preview) are stubbed.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

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
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'lcd5' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
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
  sizesForSurface: (_meta: unknown, surface: string) => (surface === 'q60' ? ['2x4'] : ['2x2', '4x4']),
  appAvailableForSurface: () => true,
}));
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: { layout: PanelLayout; surface: string }) => (
    <div
      data-testid="embed"
      data-surface={props.surface}
      data-page-count={props.layout.pages.length}
      data-widget-count={props.layout.pages.flatMap(p => p.widgets).length}
    />
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

function widget(id: string, type: string, col: number, row: number, size: PanelWidget['size'] = '2x2'): PanelWidget {
  return { id, type, size, col, row };
}

function layout(widgets: PanelWidget[], surface: PanelLayout['surface'] = 'monitor'): PanelLayout {
  return { layoutSchemaVersion: 2, surface, pages: [{ id: 'p1', widgets }], activePageId: 'p1' };
}

const DEVICE: PanelDevice = {
  id: 'monitor:lcd5',
  name: 'iCUE LINK 5" LCD',
  connectionKind: 'attached-monitor',
  surfaceProfileKey: 'monitor-lcd5',
  runtimeSurface: 'monitor',
  panelRecordId: 'lcd5',
  displayId: 'XMD00EA-1',
  previewSize: { width: 720, height: 1280 },
  capabilities: { surface: 'monitor', touch: false } as PanelDevice['capabilities'],
} as PanelDevice;

function record(extra: Record<string, unknown>) {
  return {
    id: 'lcd5',
    displayId: 'XMD00EA-1',
    reserveMonitor: true,
    capabilities: { surface: 'monitor', family: 'icue-link-lcd5', cssWidth: 720, cssHeight: 1280, dpr: 1, dpi: 294, touch: false },
    ...extra,
  };
}

const patches = () => patchPanelDeviceMock.mock.calls.map(([, patch]) => patch as { widgetSize?: string; layout?: PanelLayout });

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => vi.restoreAllMocks());

async function renderPage(rec: Record<string, unknown>) {
  fetchPanelDevicesMock.mockResolvedValue({ devices: [record(rec)] });
  render(<PanelDevicePage device={DEVICE} />);
  await waitFor(() => expect(screen.getByRole('radio', { name: 'devices.panels.widgetSize.small' })).not.toBeDisabled());
}

describe('PanelDevicePage widget size', () => {
  it('names the widgets that will not fit before switching to large, then writes size and layout together', async () => {
    await renderPage({ layout: layout([widget('a', 'clock', 0, 0), widget('b', 'weather', 2, 0)]) });
    expect(screen.getByRole('radio', { name: 'devices.panels.widgetSize.small' })).toHaveAttribute('aria-checked', 'true');

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'devices.panels.widgetSize.large' })); });

    expect(screen.getByText('devices.panels.widgetSize.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('name.weather')).toBeInTheDocument();
    expect(patches()).toHaveLength(0);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.panels.widgetSize.confirm' })); });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].widgetSize).toBe('large');
    expect(patches()[0].layout?.pages.flatMap(p => p.widgets).map(w => w.type)).toEqual(['clock']);
    await waitFor(() => expect(screen.getByTestId('embed').dataset.surface).toBe('q60'));
    // The one-widget size carries the Q-series Single / Playlist rotation.
    expect(screen.getByRole('radiogroup', { name: 'panel.playlist.mode' })).toBeInTheDocument();
  });

  it('switches straight to small when everything fits', async () => {
    await renderPage({ widgetSize: 'large', layout: layout([widget('a', 'clock', 0, 0, '2x4')], 'q60') });
    expect(screen.getByTestId('embed').dataset.surface).toBe('q60');

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'devices.panels.widgetSize.small' })); });

    expect(screen.queryByText('devices.panels.widgetSize.confirmTitle')).not.toBeInTheDocument();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].widgetSize).toBe('small');
    expect(screen.getByTestId('embed').dataset.surface).toBe('monitor');
    expect(screen.queryByRole('radiogroup', { name: 'panel.playlist.mode' })).not.toBeInTheDocument();
  });

  it('keeps a non-touch panel on one page when its grid is full', async () => {
    const full = [0, 2, 4].flatMap(row => [widget(`l${row}`, 'clock', 0, row), widget(`r${row}`, 'weather', 2, row)]);
    await renderPage({ layout: layout(full) });

    expect(screen.getByTestId('catalog-add').dataset.canAdd).toBe('false');
    await act(async () => { fireEvent.click(screen.getByTestId('catalog-add')); });

    expect(screen.getByTestId('embed').dataset.pageCount).toBe('1');
    expect(patches().every(p => (p.layout?.pages.length ?? 1) === 1)).toBe(true);
  });
});
