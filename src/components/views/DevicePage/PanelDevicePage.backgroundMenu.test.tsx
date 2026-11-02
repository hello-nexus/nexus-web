import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';

// Single-widget (q60) device page: deleting the widget, the background menu and the
// opaque-widget notice, with the preview iframe and the media flow stubbed.

const fetchPanelDevicesMock = vi.fn();
const commitBackgroundModeMock = vi.hoisted(() => vi.fn());
const commitBackgroundMediaMock = vi.hoisted(() => vi.fn());
const themeOverrides = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const openFilesMock = vi.hoisted(() => vi.fn());
const openGifsMock = vi.hoisted(() => vi.fn());
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
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
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
    theme: { themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark', gaugeGradient: [], ...themeOverrides.value },
    commitThemeSync: vi.fn(), commitThemeMode: vi.fn(), commitAccentSync: vi.fn(),
    previewAccent: vi.fn(), commitAccent: vi.fn(), previewBackground: vi.fn(),
    commitBackground: vi.fn(), commitBackgroundMode: commitBackgroundModeMock, commitBackgroundMedia: commitBackgroundMediaMock, commitBackgroundEffect: vi.fn(),
    commitBackgroundTemplate: vi.fn(), previewBackgroundEffectState: vi.fn(), commitBackgroundEffectState: vi.fn(),
    previewBackgroundOpacity: vi.fn(), commitBackgroundOpacity: vi.fn(), previewWidgetOpacity: vi.fn(),
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitBackgroundFrost: vi.fn(),
  }),
  buildPanelThemeVars: () => ({}),
  panelAccentColor: () => '#2563eb',
  useResolvedPanelThemeMode: () => 'dark',
}));
vi.mock('../../../panel/editor/PanelWidgetCatalog', () => ({
  PanelWidgetCatalog: (props: { onAdd: (type: string, size: string) => void }) => (
    <button data-testid="catalog-add" onClick={() => props.onAdd('cooling', '2x2')}>add</button>
  ),
}));
vi.mock('../../../panel/editor/PanelThemeSettings', () => ({
  PanelThemeSettings: () => <div data-testid="theme" />,
}));
// Stub the widget registry so the inline settings preview + normalize use a
// lightweight app def (the real CoolingWidget needs UiSettingsProvider).
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: 'k', sizes: ['2x2', '4x4'], defaultSize: '2x2', icon: () => null },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: () => ['2x2', '4x4'],
  // 'hidden' stands in for a widget the panel filters out on this surface.
  appAvailableForSurface: (meta: { type: string }) => meta.type !== 'hidden',
}));

// Stub the preview: a click target for the widget, the background menu and the covered signal.
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: {
    layout: PanelLayout;
    onWidgetClicked: (w: PanelWidget) => void;
    onBackgroundMenu: (p: { x: number; y: number }) => void;
    onBackgroundCovered: (covered: boolean) => void;
  }) => (
    <div data-testid="embed" data-widget-count={props.layout.pages.flatMap(p => p.widgets).length}>
      {props.layout.pages.flatMap(p => p.widgets).map(w => (
        <button key={w.id} data-testid={`click-${w.id}`} onClick={() => props.onWidgetClicked(w)}>{w.id}</button>
      ))}
      <button data-testid="open-menu" onClick={() => props.onBackgroundMenu({ x: 5, y: 5 })}>menu</button>
      <button data-testid="covered-on" onClick={() => props.onBackgroundCovered(true)}>on</button>
      <button data-testid="covered-off" onClick={() => props.onBackgroundCovered(false)}>off</button>
    </div>
  ),
}));
vi.mock('../../../panel/background/BackgroundQuickImport', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    BackgroundQuickImport: forwardRef((props: { onSelect: (id: string, type: 'animated', alpha: boolean) => void }, ref) => {
      useImperativeHandle(ref, () => ({ openFiles: openFilesMock, openGifs: openGifsMock }));
      return <button data-testid="quick-pick" onClick={() => { props.onSelect('m1', 'animated', false); announceBackgroundMediaCommitted('dev1'); }}>pick</button>;
    }),
  };
});

import { announceBackgroundMediaCommitted } from '../../../api/panelBackgroundMedia';
import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

const LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'q60',
  pages: [{ id: 'p1', widgets: [{ id: 'w1', type: 'clock', size: '2x4', col: 0, row: 0 }] }],
};

const DEVICE: PanelDevice = {
  id: 'dev1',
  name: 'Q60',
  sourceId: 'q60',
  connectionKind: 'simulated',
  surfaceProfileKey: 'q60',
  runtimeSurface: 'q60',
  capabilities: { surface: 'q60', touch: false } as PanelDevice['capabilities'],
} as PanelDevice;

beforeEach(() => {
  localStorage.setItem('nexus_simulated_panel_records', JSON.stringify({ q60: 'dev1' }));
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  commitBackgroundModeMock.mockReset();
  commitBackgroundMediaMock.mockReset();
  openFilesMock.mockReset();
  openGifsMock.mockReset();
  themeOverrides.value = {};
  fetchPanelDevicesMock.mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'q60', touch: false }, layout: LAYOUT, reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

async function load() {
  render(<PanelDevicePage device={DEVICE} />);
  await waitFor(() => expect(screen.getByTestId('embed').dataset.widgetCount).toBe('1'));
}

describe('PanelDevicePage single-widget surface', () => {
  it('lets the user delete the only widget, leaving an empty slot', async () => {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('click-w1')); });
    await act(async () => { fireEvent.click(await screen.findByLabelText('devices.panels.widgetSettings.remove')); });
    await waitFor(() => expect(screen.getByTestId('embed').dataset.widgetCount).toBe('0'));
  });
});

describe('PanelDevicePage background menu', () => {
  async function openMenu() {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('open-menu')); });
  }

  it('names the row Background options and offers import and GIFs but no Remove', async () => {
    await openMenu();
    expect(screen.getByText('panel.background.options')).toBeTruthy();
    expect(screen.getByText('panel.background.importMedia')).toBeTruthy();
    expect(screen.getByText('lighting.controls.klipyBrowse')).toBeTruthy();
    expect(screen.queryByText('panel.widget.menu.remove')).toBeNull();
  });

  it('renders as a dashboard menu, so the panel chrome scale does not apply', async () => {
    await openMenu();
    const menu = screen.getByText('panel.background.options').closest('[data-state]');
    expect(menu?.getAttribute('data-surface')).toBe('desktop');
  });

  it('starts the import and GIF flows from its rows', async () => {
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByText('panel.background.importMedia')); });
    expect(openFilesMock).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByTestId('open-menu')); });
    await act(async () => { fireEvent.click(screen.getByText('lighting.controls.klipyBrowse')); });
    expect(openGifsMock).toHaveBeenCalledTimes(1);
  });

  it('closes when focus moves into the preview iframe or the iframe reports a click', async () => {
    await openMenu();
    expect(screen.queryByText('panel.background.options')).not.toBeNull();
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    expect(screen.queryByText('panel.background.options')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('open-menu')); });
    expect(screen.queryByText('panel.background.options')).not.toBeNull();
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'simulator/widget-clicked' } })); });
    expect(screen.queryByText('panel.background.options')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('open-menu')); });
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'simulator/background-clicked' } })); });
    expect(screen.queryByText('panel.background.options')).toBeNull();
  });

  it('opens the Background tab from the name row', async () => {
    await openMenu();
    expect(screen.queryByTestId('theme')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('panel.background.options')); });
    await waitFor(() => expect(screen.getByTestId('theme')).toBeTruthy());
  });

  it('applies a quick pick as the media background at once', async () => {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('quick-pick')); });
    expect(commitBackgroundMediaMock).toHaveBeenCalledWith('m1', 'animated', false);
  });
});

describe('PanelDevicePage opaque widget notice', () => {
  const coverNotice = () => screen.queryByText('devices.panels.backgroundCovered');
  const commit = async () => { await act(async () => { fireEvent.click(screen.getByTestId('quick-pick')); }); };

  it('shows nothing on load, even while the widget covers the background', async () => {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('covered-on')); });
    expect(coverNotice()).toBeNull();
  });

  it('shows after a commit, under the preview, in the neutral tone, and clears when the widget stops covering', async () => {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('covered-on')); });
    await commit();
    const notice = coverNotice();
    expect(notice).not.toBeNull();
    expect(screen.getByTestId('embed').compareDocumentPosition(notice!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice!.closest('[data-tone]')?.getAttribute('data-tone')).toBe('info');
    await act(async () => { fireEvent.click(screen.getByTestId('covered-off')); });
    expect(coverNotice()).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('covered-on')); });
    expect(coverNotice()).toBeNull();
  });

  it('shows nothing after a commit when the widget leaves the background visible', async () => {
    await load();
    await commit();
    expect(coverNotice()).toBeNull();
  });

  it('closes with the X, stays closed, and returns after the next commit', async () => {
    await load();
    await act(async () => { fireEvent.click(screen.getByTestId('covered-on')); });
    await commit();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'app.window.close' })); });
    expect(coverNotice()).toBeNull();
    await commit();
    expect(coverNotice()).not.toBeNull();
  });
});
